import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0129 — an empty inline object (`{}`) written as the type of the field an
// explicit `by <field>` clause names draws TWO `E`-severity diagnostics for one
// written mistake: `theta/parse/empty-schema-body` naming `'{}'`, and then a
// discriminator constraint row whose verdict is DERIVED from reading the same
// two bytes as a well-formed type
// (docs/bugs/0129-empty-object-field-type-draws-two-diagnostics.md).
//
// THE ADJUDICATION THIS FILE PINS (Reading A, route (b) of that report's §Fix).
// `schema Cat { kind: {}, name: string }` under `schema Animal by kind = Cat |
// Dog` draws EXACTLY ONE diagnostic: `theta/parse/empty-schema-body` naming
// `'{}'` (docs/spec_topics/diagnostics/code-registry-parse.md:92, whose
// *Trigger* carries "An empty inline object type (`{}`) in any `Type` position,
// at any nesting depth"). The discriminator constraint rows —
// `theta/parse/nested-discriminator` (:109) and its siblings on the explicit
// path — WITHHOLD.
//
// THE LAW IS ROW-LOCAL, NOT GENERAL. Where a construct's own position-rule walk
// has already drawn an error-severity diagnostic refusing that construct as
// ill-formed, a row whose verdict is DERIVED from reading the same construct as
// a well-formed type keeps silent and the earlier diagnostic fires ALONE. That
// clause is already in the registry verbatim at
// docs/spec_topics/diagnostics/code-registry-parse.md:97 ("An annotation whose
// own position-rule walk … already drew an error-severity diagnostic keeps that
// diagnostic ALONE") and :98, which names "an empty inline object" among the
// walks that trigger it. The discriminating test is :97's own: would the
// construct's ABSENCE reach the same verdict? If yes the row keeps firing (an
// independent fault, as with `theta/parse/bare-return-in-non-void`); if no the
// verdict is derived from the refused text and is withheld. `{}`'s absence
// leaves `kind` untyped, which reaches no top-level/nesting verdict at all — so
// `nested-discriminator` is derived and withholds. Nothing here states a general
// cascade rule; bug 0093 owns that question and is untouched.
//
// WHY THE WITHHELD ROWS ARE ASSERTED AS "THE EMPTY-SCHEMA-BODY LINE ALONE"
// rather than as "no `nested-discriminator`": the withhold is of the explicit
// path's whole constraint set for that field, so a fix that merely reclassifies
// `{}` away from `nested` and lets `theta/parse/non-literal-discriminator`
// (:111) fire in its place has not satisfied the adjudication. A whole-list
// `toEqual` is the only assertion shape that catches that substitution;
// `toContain` would pass under it.
//
// WHAT MUST NOT MOVE. The unchanged-control cells below are GREEN at HEAD and
// stay green: a genuine nested discriminator (`{ type: "x" }`), `{a: {}}` (two
// EARNED lines — the inner empty object and a genuinely nested field one level
// down), a literal union, `by ghost` (bug 0046's silence), `{}` on a field the
// clause does not name, the implicit-detection path (§Non-goals: byte-identical,
// `detectImplicitDiscriminator` filters on `presentInAll && allLiteral`,
// src/parser/schema-declarations.ts:554, and never reads `nested`), the MIXED
// case where a SECOND variant nests genuinely, and the three brace-rooted-union
// field types bug 0095's landed capture widening now lets through.
//
// TIER: unit, offline, provider-free, deterministic. Every claim settles inside
// one `parseDoc` call (tests/helpers/e2e-s1.ts:39 — the shipped front end with
// the standard inert `parseDeps` double), which is the harness the bug doc's own
// §Reproduction used. The observable under assertion is the exact diagnostic
// byte list a load produces; an integration or live tier can observe neither
// that list nor its order, and a provider round-trip would add stochastic
// surface to a contract fully determined at the parse boundary.
//
// THE CLASSIFIER STAYS MODULE-PRIVATE. `classifyDiscriminatorFieldType`
// (src/parser/theta-document.ts:6987) is not exported and bug 0096 §Fix — carried
// forward as bug 0129 §Fix constraint 2 — forbids exporting it for a test. Every
// cell here drives the shipped load path instead; no `@ts-expect-error` reaches
// into `src`.
//
// NO SILENT SKIPPING: every registry lookup asserts its row is defined before
// substituting into it, so an absent or renamed row reds by naming the registry
// page rather than by comparing against `undefined`.

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
 * The registry row's normative *Message* template for `code` (DIAG-4). Message
 * text is never hand-copied into this file: definedness is asserted here so a
 * missing or renamed row reds by naming the registry page.
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
 * `theta/parse/empty-schema-body` rendered for `subject`
 * (code-registry-parse.md:92). Every row of this file expects this line: it is
 * bug 0045's inline rule and the CORRECT half of the pair, unchanged by this
 * fix (bug 0129 §Fix constraint 5).
 */
function emptySchemaBodyLine(subject: string): string {
  const code = "theta/parse/empty-schema-body";
  return line(code, messageTemplate(code).replace("<X>", subject));
}

/**
 * `theta/parse/nested-discriminator` rendered for `field` on `schema`
 * (code-registry-parse.md:109). The line under adjudication: its *Trigger* is
 * positional ("Discriminator field is not at the top level of each variant, e.g.
 * `kind: { type: "x" }`"), so it describes a tag one level down that `{}`
 * declares at no level.
 */
function nestedDiscriminatorLine(field: string, schema: string): string {
  const code = "theta/parse/nested-discriminator";
  return line(code, messageTemplate(code).replace("<field>", field).replace("<X>", schema));
}

/**
 * `theta/parse/non-literal-discriminator` rendered for `field` on `schema`
 * (code-registry-parse.md:111). Bug 0128's row, and the substitution the
 * withheld cells must also exclude — it is a constraint row over the same
 * refused text.
 */
function nonLiteralDiscriminatorLine(field: string, schema: string): string {
  const code = "theta/parse/non-literal-discriminator";
  return line(code, messageTemplate(code).replace("<field>", field).replace("<X>", schema));
}

/**
 * `theta/parse/malformed-schema-field`, unparameterised (bug 0244, operator
 * adjudication): the exotic-whitespace row's interior holds one keyless entry
 * (a non-`ident` token with no top-level `:` behind it), so `TypeParser.parseObject`
 * now refuses it before the surrounding `nested-discriminator` verdict is reached.
 */
function malformedSchemaFieldLine(): string {
  const code = "theta/parse/malformed-schema-field";
  return line(code, messageTemplate(code));
}

/**
 * `theta/parse/absent-discriminator-field` rendered for `field` on `schema`
 * (bug 0046, settled route): an explicit `by` clause naming a field at least
 * one variant does not declare. Earned from the OTHER variant not declaring
 * the field, never from the refused `{}` text — the derived-verdict test this
 * file's own withhold rule applies ("would the construct's ABSENCE reach the
 * same verdict?") answers YES here, so this row fires BESIDE
 * `theta/parse/empty-schema-body` rather than being withheld by it.
 */
function absentDiscriminatorFieldLine(field: string, schema: string): string {
  const code = "theta/parse/absent-discriminator-field";
  return line(code, messageTemplate(code).replace("<field>", field).replace("<X>", schema));
}

/**
 * `theta/parse/missing-discriminator` rendered for `schema`
 * (code-registry-parse.md:107). The implicit path's second line, which
 * §Non-goals requires to stay byte-identical: it is reached without reading
 * `nested` at all and is the disposition docs/spec_topics/schemas.md prescribes
 * for a union with no qualifying field.
 */
function missingDiscriminatorLine(schema: string): string {
  const code = "theta/parse/missing-discriminator";
  return line(code, messageTemplate(code).replace("<X>", schema));
}

// ===========================================================================
// Fixtures — whole source strings through the shipped load path.
// ===========================================================================

/** A `mode: prompt` theta whose body is `decls` followed by a tail value. */
function thetaSrc(decls: string): string {
  return `---\nmode: prompt\n---\n${decls}\nlet a = 1\na`;
}

/** `schema Dog { kind: "dog", name: string }` — the literal-discriminator sibling. */
const DOG = 'schema Dog { kind: "dog", name: string }';

/** One labelled row: the rendered `<severity> <code>: <message>` list. */
interface Row {
  readonly label: string;
  readonly diagnostics: readonly string[];
}

/** Load one fixture and render its whole diagnostic list, in list order. */
function row(label: string, source: string, path = "bug0129.theta"): Row {
  return {
    label,
    diagnostics: parseDoc(source, path).diagnostics.map(
      (d) => `${d.severity} ${d.code}: ${d.message}`,
    ),
  };
}

/** `Cat` with `kind: <kindType>`, then `Dog`, then `schema Animal [by kind] = Cat | Dog`. */
function animalRow(label: string, kindType: string, by: boolean): Row {
  const head = by ? "schema Animal by kind = Cat | Dog" : "schema Animal = Cat | Dog";
  return row(
    label,
    thetaSrc(`schema Cat { kind: ${kindType}, name: string }\n${DOG}\n${head}`),
  );
}

/** The subject document: `kind: {}` under an explicit `by kind` (doc row A2). */
const A2_SOURCE = thetaSrc(
  `schema Cat { kind: {}, name: string }\n${DOG}\nschema Animal by kind = Cat | Dog`,
);

/** The same declarations with the union written FIRST (doc row A9). */
const A9_SOURCE = thetaSrc(
  `schema Animal by kind = Cat | Dog\nschema Cat { kind: {}, name: string }\n${DOG}`,
);

/**
 * `<code> @<line>:<col>-<line>:<col>` for every diagnostic, in list order.
 *
 * `Diagnostic.range` is optional on the type, so an absent range is asserted
 * against rather than rendered as `undefined`: a rangeless diagnostic here would
 * be an unmet precondition of the order rows, which compare positions.
 */
function codesWithRanges(source: string): string[] {
  return parseDoc(source, "bug0129.theta").diagnostics.map((d) => {
    expect(
      d.range,
      `every diagnostic this fixture produces must carry a range; ${d.code} carried none`,
    ).toBeDefined();
    const r = d.range as SourceRange;
    return `${d.code} @${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
  });
}

// ===========================================================================
// The withheld rows — RED at HEAD, each by exactly one extra line.
// ===========================================================================

describe("bug 0129 — a `by`-named field typed `{}` draws the empty-schema-body line alone", () => {
  it("every spelling of the subject input renders exactly one diagnostic", () => {
    const observed: readonly Row[] = [
      // A2 — the subject. `kind` IS at the top level of `Cat` (measured: the
      // field survives capture with `typeSource` `{}`), and `{}` declares no
      // field at any level, so `nested-discriminator`'s positional Trigger
      // (code-registry-parse.md:109) has no tag to name. Its verdict is derived
      // from reading the refused two bytes as a type, so the row withholds and
      // the empty-schema-body line fires ALONE (:97/:98's clause).
      animalRow("A2 — `{}` under `by kind`", "{}", true),
      // A6 — a whitespace interior. `empty-schema-body`'s key is the absence of
      // an interior TOKEN, not of bytes, so this is the same refused construct
      // and the same withhold; only the first line's end column moves.
      animalRow("A6 — a whitespace interior `{   }`", "{   }", true),
      // A10 — a wire rename does not interact: an explicit `by` resolves by
      // theta-side name, so the same field is named and the same text refused.
      row(
        "A10 — wire-renamed `kind as \"Kind\": {}`",
        thetaSrc(
          `schema Cat { kind as "Kind": {}, name: string }\n${DOG}\nschema Animal by kind = Cat | Dog`,
        ),
      ),
      // A11 — the `.thetalib` spelling carries no frontmatter and no tail
      // expression; the withhold is a property of the construct, not the file
      // extension, so this row must not diverge from A2's disposition.
      row(
        "A11 — the same declarations in a `.thetalib`",
        `schema Cat { kind: {}, name: string }\n${DOG}\nschema Animal by kind = Cat | Dog\n`,
        "bug0129.thetalib",
      ),
      // A7 — two written mistakes. Bug 0045's per-occurrence contract keeps two
      // empty-schema-body lines (§Fix constraint 5); the union-scoped
      // constraint row withholds once, so the count goes 3 -> 2.
      row(
        "A7 — `{}` on BOTH variants",
        thetaSrc(
          "schema Cat { kind: {}, name: string }\nschema Dog { kind: {}, name: string }\nschema Animal by kind = Cat | Dog",
        ),
      ),
      // A13 — one `{}` among three variants. The `.some` fold over per-variant
      // occurrences (src/parser/schema-declarations.ts:505) is bug 0046's
      // subject and keeps its semantics; what changes is that the one refused
      // occurrence contributes no derived verdict, so the union-scoped line has
      // nothing left to fire on.
      row(
        "A13 — three variants, `{}` on the middle one",
        thetaSrc(
          `schema Cat { kind: "cat", name: string }\nschema Dog { kind: {}, name: string }\nschema Cow { kind: "cow", name: string }\nschema Animal by kind = Cat | Dog | Cow`,
        ),
      ),
      // The field ABSENT from the other variant. Bug 0046 settled what an
      // absent occurrence is worth: `Dog` does not declare `kind` at all, so
      // `theta/parse/absent-discriminator-field` fires — earned from `Dog`'s
      // own absence, not derived from `Cat`'s refused `{}` text — BESIDE the
      // empty-schema-body line rather than withheld by it.
      row(
        "the `by` field absent from the other variant",
        thetaSrc(
          "schema Cat { kind: {}, name: string }\nschema Dog { name: string }\nschema Animal by kind = Cat | Dog",
        ),
      ),
    ];

    expect(observed).toEqual([
      {
        label: "A2 — `{}` under `by kind`",
        diagnostics: [emptySchemaBodyLine("{}")],
      },
      {
        label: "A6 — a whitespace interior `{   }`",
        diagnostics: [emptySchemaBodyLine("{}")],
      },
      {
        label: 'A10 — wire-renamed `kind as "Kind": {}`',
        diagnostics: [emptySchemaBodyLine("{}")],
      },
      {
        label: "A11 — the same declarations in a `.thetalib`",
        diagnostics: [emptySchemaBodyLine("{}")],
      },
      {
        label: "A7 — `{}` on BOTH variants",
        diagnostics: [emptySchemaBodyLine("{}"), emptySchemaBodyLine("{}")],
      },
      {
        label: "A13 — three variants, `{}` on the middle one",
        diagnostics: [emptySchemaBodyLine("{}")],
      },
      {
        label: "the `by` field absent from the other variant",
        diagnostics: [emptySchemaBodyLine("{}"), absentDiscriminatorFieldLine("kind", "Animal")],
      },
    ]);
  });

  it("the subject's single line is stable across repeated parses", () => {
    // Twenty parses, one distinct rendering. The disposition must not depend on
    // iteration order over declarations or fields: the withhold is a property of
    // the field's own source text, so a fix that reads accumulated diagnostics
    // instead could become order-sensitive, and this loop is what catches that.
    const renderings = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      renderings.add(JSON.stringify(codesWithRanges(A2_SOURCE)));
    }
    expect([...renderings]).toEqual([
      JSON.stringify(["theta/parse/empty-schema-body @4:1-4:38"]),
    ]);
  });

  it("declaration order does not resurrect the withheld line", () => {
    // The rendered order is declaration SOURCE order, through
    // `assembleDiagnostics`' stable `(file, line, col)` sort
    // (src/diagnostics/diagnostic.ts) — not the two passes' emission order. At
    // HEAD A2 renders empty-schema-body then nested-discriminator and A9 renders
    // them inverted, which is why bug 0129 §Fix constraint 8 requires a route to
    // name the CODE it withholds rather than "the second line". Both orders
    // must reduce to the same single line, and the range travels with the
    // assertion so a line surviving at the other declaration's position cannot
    // hide behind a code-only list.
    expect(codesWithRanges(A2_SOURCE)).toEqual([
      "theta/parse/empty-schema-body @4:1-4:38",
    ]);
    expect(codesWithRanges(A9_SOURCE)).toEqual([
      "theta/parse/empty-schema-body @5:1-5:38",
    ]);
  });
});

// ===========================================================================
// The controls — GREEN at HEAD, and byte-identical after the fix.
// ===========================================================================

describe("bug 0129 — every neighbouring input keeps its present disposition", () => {
  it("the correct emissions, the clause-scoping silences and the implicit path are unchanged", () => {
    const observed: readonly Row[] = [
      // A1 — the same field type with no `by` clause anywhere. This is the
      // disposition the withheld rows above must converge on, measured
      // independently of any union.
      row("A1 — the field type alone", thetaSrc("schema Cat { kind: {}, name: string }")),
      // A4 — the input code-registry-parse.md:109 names verbatim. A tag sits one
      // level down, the construct is a well-formed inline object that drew no
      // refusal of its own, and the verdict is therefore not derived from
      // refused text: the row fires, and this is what the withhold must not
      // reach (§Fix constraint 6).
      animalRow("A4 — a genuine nested discriminator", '{ type: "x" }', true),
      // A12 — the discriminating case that bounds every route. `{a: {}}` carries
      // TWO faults: a field one level down (the nesting :109 describes) and an
      // empty inline object at the inner position (:92). The outer group is a
      // well-formed object whose own walk refused only its INTERIOR, so the
      // nesting verdict is not derived from a refused construct at the field's
      // own position. Both lines are earned and neither may collapse.
      animalRow("A12 — `{a: {}}`, two earned lines", "{a: {}}", true),
      // A brace group whose interior is U+00A0 NO-BREAK SPACE. `trim()` counts
      // it as whitespace, `tokeniseType` (src/parser/type-grammar.ts:319) does
      // not: only " ", "\t", "\n", "\r" are skipped there, so the character is
      // a `punct` token, the interior is NOT empty, and
      // `theta/parse/empty-schema-body` never fires. No refusal means nothing to
      // withhold, so the group is genuinely nested and keeps
      // `nested-discriminator`. A `trim()`-based interior test in the classifier
      // would call this the refused construct, withhold the row, and load the
      // input with ZERO diagnostics — which is why the classifier spells the
      // tokenizer's whitespace set instead.
      animalRow("exotic whitespace — `{\u00A0}` (U+00A0)", "{\u00A0}", true),
      // A5 — a literal union. Bug 0128's row: the field resolves in every
      // variant and is not a single literal, and no earlier row refused the
      // text, so the constraint fires on its own merits.
      animalRow("A5 — a literal union", '"a" | "b"', true),
      // A8 — `by ghost`, naming a field no variant declares (bug 0046 class 1,
      // settled route). Neither variant declares `ghost` at all, so
      // `theta/parse/absent-discriminator-field` fires BESIDE the
      // empty-schema-body line — earned independently of the refused `{}` text
      // on the unrelated `kind` field.
      row(
        "A8 — `by ghost`",
        thetaSrc(
          `schema Cat { kind: {}, name: string }\n${DOG}\nschema Animal by ghost = Cat | Dog`,
        ),
      ),
      // A14 — `{}` on a field the clause does NOT name. Already one line at
      // HEAD, and the withhold must not widen into a suppression of the first
      // line: the count here is unchanged in both directions.
      row(
        "A14 — `{}` on a field the `by` does not name",
        thetaSrc(
          `schema Cat { kind: "cat", tag: {}, name: string }\n${DOG}\nschema Animal by kind = Cat | Dog`,
        ),
      ),
      // A15 — the clean control: a non-empty group on an unnamed field loads
      // with no diagnostic at all, so the fix adds no emission anywhere.
      row(
        "A15 — a non-empty group on an unnamed field",
        thetaSrc(
          `schema Cat { kind: "cat", tag: { a: string }, name: string }\n${DOG}\nschema Animal by kind = Cat | Dog`,
        ),
      ),
      // The implicit path, which §Non-goals and §Fix constraint 3 require to be
      // byte-identical. `detectImplicitDiscriminator` filters on `presentInAll
      // && allLiteral` (src/parser/schema-declarations.ts:554) and never reads
      // `nested`, so `missing-discriminator` here is not a verdict derived from
      // reading `{}` as a type — the union genuinely has no shared
      // single-literal field, which is the disposition
      // docs/spec_topics/schemas.md prescribes — and it stays.
      animalRow("the implicit path — `{}` with no `by`", "{}", false),
      // MIXED — the second variant nests GENUINELY. `Dog.kind` is a well-formed
      // inline object with a tag one level down, so the union-scoped line is
      // earned independently of `Cat`'s refused text and survives the withhold.
      // A route keyed on "some variant's occurrence is an empty object" would
      // wrongly silence this.
      row(
        "MIXED — `{}` in one variant, a genuine nesting in the other",
        thetaSrc(
          `schema Cat { kind: {}, name: string }\nschema Dog { kind: { type: "y" }, name: string }\nschema Animal by kind = Cat | Dog`,
        ),
      ),
      // The three brace-rooted union field types bug 0095's landed capture
      // widening now lets through. The field's type is a UNION, not an empty
      // object, so the field position drew no refusal of the whole construct and
      // `non-literal-discriminator`'s verdict is not derived from any refused
      // arm — `{a: integer} | {b: string}` draws it with no empty arm at all.
      // The inner `{}` of the first two keeps its own inline refusal (:92).
      animalRow("bug 0095 — `{} | null`", "{} | null", true),
      animalRow("bug 0095 — `null | {}`", "null | {}", true),
      animalRow(
        "bug 0095 — `{a: integer} | {b: string}`",
        "{a: integer} | {b: string}",
        true,
      ),
    ];

    expect(observed).toEqual([
      {
        label: "A1 — the field type alone",
        diagnostics: [emptySchemaBodyLine("{}")],
      },
      {
        label: "A4 — a genuine nested discriminator",
        diagnostics: [nestedDiscriminatorLine("kind", "Animal")],
      },
      {
        label: "A12 — `{a: {}}`, two earned lines",
        diagnostics: [emptySchemaBodyLine("{}"), nestedDiscriminatorLine("kind", "Animal")],
      },
      {
        label: "exotic whitespace — `{\u00A0}` (U+00A0)",
        // Bug 0244 (operator adjudication) flip: the U+00A0 token occupies the
        // field-name position with no `ident` kind and no top-level `:` behind
        // it — a keyless entry with no stray close token — so `parseObject`'s
        // non-`ident` discard arm now refuses it, ahead of the nesting verdict
        // this row keeps. ADDED line, not a substitution: `nested-discriminator`
        // is unmoved.
        diagnostics: [malformedSchemaFieldLine(), nestedDiscriminatorLine("kind", "Animal")],
      },
      {
        label: "A5 — a literal union",
        diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")],
      },
      {
        label: "A8 — `by ghost`",
        diagnostics: [emptySchemaBodyLine("{}"), absentDiscriminatorFieldLine("ghost", "Animal")],
      },
      {
        label: "A14 — `{}` on a field the `by` does not name",
        diagnostics: [emptySchemaBodyLine("{}")],
      },
      {
        label: "A15 — a non-empty group on an unnamed field",
        diagnostics: [],
      },
      {
        label: "the implicit path — `{}` with no `by`",
        diagnostics: [emptySchemaBodyLine("{}"), missingDiscriminatorLine("Animal")],
      },
      {
        label: "MIXED — `{}` in one variant, a genuine nesting in the other",
        diagnostics: [emptySchemaBodyLine("{}"), nestedDiscriminatorLine("kind", "Animal")],
      },
      {
        label: "bug 0095 — `{} | null`",
        diagnostics: [
          emptySchemaBodyLine("{}"),
          nonLiteralDiscriminatorLine("kind", "Animal"),
        ],
      },
      {
        label: "bug 0095 — `null | {}`",
        diagnostics: [
          emptySchemaBodyLine("{}"),
          nonLiteralDiscriminatorLine("kind", "Animal"),
        ],
      },
      {
        label: "bug 0095 — `{a: integer} | {b: string}`",
        diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")],
      },
    ]);
  });
});
