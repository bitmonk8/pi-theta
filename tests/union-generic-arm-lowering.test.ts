import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0043 — `lowerTypeExpr` (src/parser/params.ts:391) tests for a generic
// application BEFORE it splits a union, so any union whose source text ends in
// `>` is consumed whole by the generic arm and never split
// (docs/bugs/0043-union-nonprimitive-arm-lowers-permissive.md).
//
// ONE FRAME, TWO OUTCOMES. The generic predicate is positional, not structural:
// a `<` past index 0 plus a final `>` (`:395–396`). Every union whose LAST arm
// is `array<T>` satisfies it, because that arm's own closing `>` is the source's
// last character.
//
//   - `ctor` is everything before the FIRST `<`. For `integer | array<integer>`
//     that is `"integer | array"`, which is not `"array"`, so the permissive
//     return at `:408` fires and the WHOLE union — primitive arms included —
//     lowers to `{}`.
//   - When the source begins `array<`, `ctor` IS `"array"` and the mis-sliced
//     argument (`string> | array<integer`) carries no top-level comma, so the
//     single-argument branch at `:399–401` matches and the union lowers to the
//     concrete WRONG type `{"type":"array","items":{}}`. The mis-sliced text is
//     never identifier-shaped, so a `NamedType` written inside it never reaches
//     the resolution arm and `theta/parse/unresolved-named-type` under-emits.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schema-subset.md:81 — SUBS-1: a union with any
//     non-primitive arm MUST lower to `{"anyOf": [...]}`, arms in source order;
//     :85 — *Array element order*; :77 — `array<T>` lowers to
//     `{"type":"array","items":<T-lowered>}`, so an `array<T>` union arm is
//     lowerable and must appear as an `anyOf` variant.
//   - docs/spec_topics/grammar.md:94 — `Type "|" Type` with `Type` recursive;
//     :99 — `GenericType ::= "array" "<" Type ">"`; :105 — union arms are a
//     bare-`Type` position. An `array<T>` union arm is ordinary grammar.
//   - docs/spec_topics/type-system.md:15 — one type grammar in every annotation
//     position, so the four `Type` positions below lower one type expression
//     identically.
//   - docs/spec_topics/diagnostics/code-registry-parse.md — the
//     `theta/parse/unresolved-named-type` row names five positions, four of
//     which route through this frame. Its *Message* column is the DIAG-4 oracle
//     read below; no registry edit is needed.
//   - docs/spec_topics/schemas.md:123 (§Recursion) and :147 — recursion guarded
//     by a structural constructor is admitted, so `schema X = integer |
//     array<X>` lowers to a self-`$ref` `anyOf`.
//
// THE FOUR `Type` POSITIONS this file drives, and how each is read back:
//   1. ALIAS RHS       `schema M = <T>`, read as `$defs.M` of a `params:`
//                      document whose one field is `a: M`.
//   2. SCHEMA-BODY     `schema S { a: <T> }`, read as
//      FIELD           `$defs.S.properties.a` of a document whose field is
//                      `p: S`.
//   3. `params:` FIELD `p: <T>`, read as `properties.p`.
//   4. `@<T>`          the root of `lowerQueryResponseSchema`'s return, with the
//      ANNOTATION      document `$defs` split off and asserted separately.
//
// PROBED CURRENT SIGNATURES (HEAD d06daae3, offline, deterministic). The bug
// doc's §Reproduction was written at 0.45.0 and is STALE in three places, all
// re-derived here; every other row of it reproduces byte for byte.
//
//   S1  integer | array<integer>              all four: {}
//   S2  Triage | array<integer>               all four: {}
//   S3  array<string> | array<integer>        all four: {"type":"array","items":{}}
//   S4  array<string> | integer | array<boolean>   all four: same as S3
//   S5  array<Cat> | array<Dog>               all four: same as S3, no $defs at all
//   S6  integer | array<Ghost>                ONE unresolved-named-type, all four
//   S7  array<Ghost> | array<integer>         NO diagnostic, all four
//   S8  array<integer> | array<Ghost>         NO diagnostic, all four
//   R1  schema X = integer | array<X>         $defs.X = {}
//   K1  {"a":3} / {"a":"no"} / {"a":null} under `schema M = integer |
//       array<integer>`  ALL accepted (the `$defs.M = {}` hole)
//   K2  {"p":3} under `array<string> | integer | array<boolean>`  REJECTED,
//       while {"p":[{"junk":1}]} is ACCEPTED
//   G1  respondSchemaSlug(@<integer | array<integer>>)       44136fa355b3678a
//   G2  respondSchemaSlug(@<array<string> | array<integer>>) 5483e69d7515873a
//       (bug 0099 route A moved G2 to the canonical-form slug; G1 is unmoved
//       because `{}` has no keys to sort)
//
// WHERE §Reproduction IS STALE AT HEAD (bug 0039 landed in 0.49.0 between):
//   (i)  `{a: integer} | array<integer>` no longer lowers `{}` everywhere.
//        `lowerTypeSource` (body-type-lowering.ts) now splits a union whose
//        segments are brace-balanced and one of which is a single enclosing
//        brace group, so the ALIAS and ANNOTATION positions already lower
//        `{"anyOf":[{"$ref":"#/$defs/__inline_<slug>"},{"type":"array",
//        "items":{"type":"integer"}}]}` — correct today, and unmoved by this
//        fix. The `params:` position reaches the SAME dispatch: bug 0097 §Fix
//        gave `lowerParamsFieldType` the structural `isSingleEnclosingBraceGroup`
//        test and the `lowerBraceGroupUnionArms` arm path (both params.ts), so
//        this source — two brace-balanced segments, the first a single
//        enclosing brace group — hoists its object arm here too. The
//        SCHEMA-BODY FIELD position carries the spelling as well: bug 0095 §Fix
//        made `parseType`'s arm-start `{` branch reachable at every `Type`
//        position, so `schema S { a: {a: integer} | array<…> }` keeps its field
//        list and lowers rather than drawing `theta/parse/empty-schema-body`.
//        All four positions therefore agree byte for byte. Group (i).
//   (ii) `string | Result<integer, string>` is listed as a CONTROL, but it
//        carries a top-level `|` and therefore sits INSIDE the changed set the
//        §Fix defines ("a no-op for every source without a top-level `|`").
//        Its bytes move from `{}` to `{"anyOf":[{"type":"string"},{}]}` — the
//        SUBS-1 emission for a union with one non-primitive arm. Its
//        `theta/parse/result-in-schema-position` diagnostic does NOT move.
//        Group (j).
//   (iii) The registry row is at code-registry-parse.md:90, not :89 (one line
//        of drift). The row's content is unchanged, and the oracle below reads
//        it by CODE rather than by line.
//
// WHY THE POST-FIX EXPECTATIONS ARE REACHABLE. Every expected value asserted
// here has a REVERSED-ARM MIRROR that production already produces at HEAD:
// `array<integer> | integer`, `array<integer> | Triage`, `Cat | Dog`,
// `integer | array<string> | string`, `array<string> | null` and
// `schema X = array<X> | integer` all lower the SUBS-1 `anyOf` — same lowerer,
// same `$defs` closure, same AJV document — because their source text does not
// end in `>` and the union split is reached. Group (c) pins those mirrors, so
// the file states the target shape twice: once as what must start happening,
// once as what already happens one arm along.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string or one `lowerQueryResponseSchema`
// call over an annotation, plus one real `AjvSchemaValidator` compile of the
// document that call produces. An integration or live tier cannot observe any
// of it: the contract is exact lowered BYTES, a diagnostic's PRESENCE, and a
// content hash — all fully determined at the lowering boundary, none of them
// visible through a provider round trip, and a live model cannot be asked to
// prove that a parse raised. `parseDoc` (tests/helpers/e2e-s1.ts) is the
// shipped load path wrapped in the standard inert `parseDeps` double, and is
// the harness the bug doc's own §Reproduction used.
//
// NO SILENT SKIPPING: every reader below throws with the diagnostics rendered
// when the frontmatter, the `params:` block, the lowered document or the
// lowered annotation is absent. A refused parse can never read as a pass, and
// the DIAG-4 oracle asserts the registry row is present before it interpolates
// it.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

const UNRESOLVED = "theta/parse/unresolved-named-type";
const RESULT_IN_SCHEMA = "theta/parse/result-in-schema-position";
const EMPTY_SCHEMA_BODY = "theta/parse/empty-schema-body";

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
 * The registry row's normative *Message* template with its single `<name>`
 * placeholder filled. Definedness is asserted first so a missing row reds by
 * naming the registry rather than by a bare `undefined` comparison.
 */
function unresolvedMessage(name: string): string {
  const template = registryMessage(REGISTRY, UNRESOLVED) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${UNRESOLVED}`,
  ).toBeDefined();
  return (template as string).replace("<name>", name);
}

/** The one rendered line every position of the row must produce for `name`. */
function unresolvedLine(name: string): string {
  return `error ${UNRESOLVED}: ${unresolvedMessage(name)}`;
}

/**
 * The `EMPTY_SCHEMA_BODY` row's normative *Message* template with its single
 * `<X>` placeholder filled. Definedness AND placeholder presence are asserted
 * first, so a missing row — or a template that lost its placeholder — reds by
 * naming the registry rather than by a bare `undefined` comparison or a
 * silently unsubstituted string.
 */
function emptySchemaBodyMessage(subject: string): string {
  const template = registryMessage(REGISTRY, EMPTY_SCHEMA_BODY) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${EMPTY_SCHEMA_BODY}`,
  ).toBeDefined();
  expect(
    template,
    `DIAG-4: the ${EMPTY_SCHEMA_BODY} Message template must carry the <X> placeholder; template=${JSON.stringify(template)}`,
  ).toContain("<X>");
  return (template as string).replace("<X>", subject);
}

/** The one rendered line an empty inline object type produces (bug 0045 §Fix). */
function emptySchemaBodyLine(subject: string): string {
  return `error ${EMPTY_SCHEMA_BODY}: ${emptySchemaBodyMessage(subject)}`;
}

// ===========================================================================
// Fixtures and readers. Loud on every unexpected disposition.
// ===========================================================================

/**
 * The declarations every fixture resolves against. `Ghost` is declared nowhere,
 * which is what makes the resolution parity cell (group (e)) a question about
 * the lowerer's reach rather than about the resolution map.
 */
const DECLS =
  'schema Cat { kind: "cat" }\nschema Dog { kind: "dog" }\nschema Triage { urgent: boolean }\n';

/** The closed lowering of `schema Cat { kind: "cat" }` — the `#/$defs/Cat` target. */
const CAT_DEF = {
  type: "object",
  properties: { kind: { const: "cat" } },
  required: ["kind"],
  additionalProperties: false,
};

/** The closed lowering of `schema Dog { kind: "dog" }`. */
const DOG_DEF = {
  type: "object",
  properties: { kind: { const: "dog" } },
  required: ["kind"],
  additionalProperties: false,
};

/** The closed lowering of `schema Triage { urgent: boolean }`. */
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * A YAML single-quoted scalar. Every `params:` fixture here is quoted so a `|`
 * or a `"` in the type source cannot be read as YAML structure; the bug doc's
 * §Reproduction records that the unquoted plain-scalar spelling lowers
 * byte-identically, so the quoting is a fixture concern only.
 */
function yamlQuoted(typeSource: string): string {
  return `'${typeSource.replace(/'/g, "''")}'`;
}

/** What one `Type` position yields for one type source. */
interface PositionRead {
  /** Every diagnostic the whole-document load raised, rendered. */
  readonly diags: readonly string[];
  /** The fragment AT the type position, absent when the load produced none. */
  readonly fragment?: unknown;
  /** The whole lowered document, for the `$ref`-closure and AJV checks. */
  readonly document?: LoweredSchema;
  /** The `$defs` keys of that document, sorted; empty when it carries none. */
  readonly defNames: readonly string[];
}

/** The four registered `Type` positions this frame is reached from. */
const POSITIONS = ["alias", "field", "params", "annotation"] as const;
type Position = (typeof POSITIONS)[number];

function loweredParamsDocument(doc: ThetaDocument): Record<string, unknown> | undefined {
  return doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined;
}

function defNamesOf(document: Record<string, unknown> | undefined): string[] {
  return Object.keys((document?.["$defs"] ?? {}) as Record<string, unknown>).sort();
}

function schemaDeclsOf(body: string): {
  readonly schemas: readonly SchemaDecl[];
  readonly enums: readonly EnumDecl[];
} {
  const doc = parseDoc(`---\nmode: prompt\n---\n${body}let inert = 1\ninert\n`, "bug0043.theta");
  return {
    schemas: doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema"),
    enums: doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum"),
  };
}

/**
 * Read one type source at one of the four positions. Never throws on a refused
 * load — a fixture whose names do not resolve (group (e)) has no lowered
 * document by design, and the caller asserts on `diags` instead. What IS loud
 * is a caller asking for bytes that are absent: `fragmentOf` below.
 */
function readAt(position: Position, typeSource: string): PositionRead {
  if (position === "alias") {
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n  a: M\n---\n${DECLS}schema M = ${typeSource}\nlet inert = 1\ninert\n`,
      "bug0043.theta",
    );
    const document = loweredParamsDocument(doc);
    const defs = (document?.["$defs"] ?? {}) as Record<string, unknown>;
    return {
      diags: diagLines(doc),
      ...(document !== undefined
        ? { fragment: defs["M"], document: document as LoweredSchema }
        : {}),
      // `$defs.M` is the position's own wrapper, not a name the type source
      // reached, so it is dropped to keep the four positions comparable.
      defNames: defNamesOf(document).filter((name) => name !== "M"),
    };
  }
  if (position === "field") {
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n  p: S\n---\n${DECLS}schema S { a: ${typeSource} }\nlet inert = 1\ninert\n`,
      "bug0043.theta",
    );
    const document = loweredParamsDocument(doc);
    const defs = (document?.["$defs"] ?? {}) as Record<string, unknown>;
    const s = (defs["S"] ?? undefined) as Record<string, unknown> | undefined;
    const properties = (s?.["properties"] ?? {}) as Record<string, unknown>;
    return {
      diags: diagLines(doc),
      ...(document !== undefined
        ? { fragment: properties["a"], document: document as LoweredSchema }
        : {}),
      // `$defs.S` is the position's own wrapper, not a name the type source
      // reached, so it is dropped to keep the four positions comparable.
      defNames: defNamesOf(document).filter((name) => name !== "S"),
    };
  }
  if (position === "params") {
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n  p: ${yamlQuoted(typeSource)}\n---\n${DECLS}let inert = 1\ninert\n`,
      "bug0043.theta",
    );
    const document = loweredParamsDocument(doc);
    const properties = (document?.["properties"] ?? {}) as Record<string, unknown>;
    return {
      diags: diagLines(doc),
      ...(document !== undefined
        ? { fragment: properties["p"], document: document as LoweredSchema }
        : {}),
      defNames: defNamesOf(document),
    };
  }
  // The annotation position: the lowerer's own return is the document, so the
  // root is split from `$defs` to compare against the other three positions'
  // fragments. The diagnostics come from the real load path over the same text.
  const decls = schemaDeclsOf(DECLS);
  const lowered = lowerQueryResponseSchema(typeSource, decls.schemas, decls.enums) as
    | Record<string, unknown>
    | undefined;
  const loadDoc = parseDoc(
    `---\nmode: prompt\n---\n${DECLS}let r = @<${typeSource}>\`ask\`\nr\n`,
    "bug0043.theta",
  );
  const root = lowered === undefined ? undefined : { ...lowered };
  if (root !== undefined) {
    delete root["$defs"];
  }
  return {
    diags: diagLines(loadDoc),
    ...(lowered !== undefined ? { fragment: root, document: lowered as LoweredSchema } : {}),
    defNames: defNamesOf(lowered),
  };
}

/**
 * The fragment at one position, or a loud failure naming the position and the
 * diagnostics that suppressed it. `undefined` is never a fixture outcome for a
 * cell that asserts bytes.
 */
function fragmentOf(label: string, position: Position, typeSource: string): unknown {
  const read = readAt(position, typeSource);
  if (read.document === undefined) {
    throw new Error(
      `${label} [${position}]: \`${typeSource}\` produced NO lowered document, so there is ` +
        `nothing for AJV to enforce at that position. Diagnostics: ${JSON.stringify(read.diags)}`,
    );
  }
  return read.fragment;
}

/** A real `AjvSchemaValidator` (the shipped V8c seam) plus the diagnostics it emits. */
function ajv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
  const emitted: Diagnostic[] = [];
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf }),
    emitted,
  };
}

/** Every `#/$defs/<name>` pointer anywhere in a document, in encounter order. */
function refNames(value: unknown): string[] {
  const names: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$ref" && typeof child === "string") {
        const match = /^#\/\$defs\/(.+)$/.exec(child);
        if (match?.[1] !== undefined) {
          names.push(match[1]);
        }
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return names;
}

/**
 * Every `$ref` a document emits must have a fragment at the document root, or
 * AJV refuses the whole document with `MissingRefError`. An `anyOf` over
 * `array<Cat> | array<Dog>` emits two refs that the `{"type":"array",
 * "items":{}}` lowering emits neither of, so this is the check that the
 * corrected lowering carries its closure with it.
 */
function expectRefsClosed(label: string, document: LoweredSchema): void {
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  const missing = [...new Set(refNames(document))].filter((name) => !(name in defs));
  expect(
    missing,
    `${label}: every \`#/$defs/<name>\` pointer must resolve at the document root; document=${JSON.stringify(document)}`,
  ).toEqual([]);
}

// ===========================================================================
// The expected fragments. One object per type source, asserted at all four
// positions — type-system.md:15's one-grammar-everywhere rule made mechanical.
// ===========================================================================

/** SUBS-1 for `integer | array<integer>` (schema-subset.md:81 + :77). */
const INT_OR_INTARRAY = {
  anyOf: [{ type: "integer" }, { type: "array", items: { type: "integer" } }],
};

/** SUBS-1 for `Triage | array<integer>` — a named arm keeps its `$ref` (:76). */
const TRIAGE_OR_INTARRAY = {
  anyOf: [{ $ref: "#/$defs/Triage" }, { type: "array", items: { type: "integer" } }],
};

/** SUBS-1 for `array<string> | array<integer>` — the `array`-headed spelling. */
const STRARRAY_OR_INTARRAY = {
  anyOf: [
    { type: "array", items: { type: "string" } },
    { type: "array", items: { type: "integer" } },
  ],
};

/** SUBS-1 for `array<string> | integer | array<boolean>` — three arms, source order. */
const THREE_ARM = {
  anyOf: [
    { type: "array", items: { type: "string" } },
    { type: "integer" },
    { type: "array", items: { type: "boolean" } },
  ],
};

/** SUBS-1 for `array<Cat> | array<Dog>` — both element `$ref`s survive. */
const CATARRAY_OR_DOGARRAY = {
  anyOf: [
    { type: "array", items: { $ref: "#/$defs/Cat" } },
    { type: "array", items: { $ref: "#/$defs/Dog" } },
  ],
};

/** The `params:` type source of the AJV table's second document. */
const THREE_ARM_SOURCE = "array<string> | integer | array<boolean>";

// ===========================================================================
// (a) THE `integer | array<T>` SPELLING — the permissive-`{}` outcome.
// RED at HEAD: every position lowers `{}`, discarding both arms.
// ===========================================================================

describe("bug 0043 (a) — a union whose LAST arm is `array<T>` lowers SUBS-1's `anyOf`, not `{}`", () => {
  const rows: ReadonlyArray<readonly [string, string, Record<string, unknown>, readonly string[]]> =
    [
      ["a1 `integer | array<integer>`", "integer | array<integer>", INT_OR_INTARRAY, []],
      ["a2 `Triage | array<integer>`", "Triage | array<integer>", TRIAGE_OR_INTARRAY, ["Triage"]],
    ];

  for (const [label, source, expected, defNames] of rows) {
    for (const position of POSITIONS) {
      it(`RED (${label} @ ${position}): the union splits and both arms survive`, () => {
        const fragment = fragmentOf(label, position, source);
        expect(
          fragment,
          `${label} [${position}]: schema-subset.md:81 (SUBS-1) requires \`{"anyOf":[...]}\` in ` +
            `source order for a union with a non-primitive arm, and :77 gives \`array<T>\` its ` +
            `bytes; the generic-application arm (params.ts:395–408) swallows the whole union ` +
            `instead. observed=${JSON.stringify(fragment)}`,
        ).toEqual(expected);
      });
    }

    // PARITY, not RED: the four positions agree at HEAD too — identically
    // wrongly. The cell exists so a fix that reorders at some positions and not
    // others cannot pass, and it must stay green across the change.
    it(`PARITY (${label}): the four positions agree byte for byte`, () => {
      const observed = POSITIONS.map((position) => fragmentOf(label, position, source));
      for (const [i, position] of POSITIONS.entries()) {
        expect(
          observed[i],
          `${label}: type-system.md:15 applies ONE type grammar to every annotation position, ` +
            `so \`${source}\` must lower identically at all four; ${position} lowered ` +
            `${JSON.stringify(observed[i])} against alias's ${JSON.stringify(observed[0])}`,
        ).toEqual(observed[0]);
      }
    });

    it(`RED (${label}): the named arms it reaches are registered as \`$defs\` and every \`$ref\` closes`, () => {
      for (const position of POSITIONS) {
        const read = readAt(position, source);
        expect(
          read.defNames,
          `${label} [${position}]: a \`$ref\` the fragment emits must have a fragment at the ` +
            `document root; observed $defs keys=${JSON.stringify(read.defNames)}`,
        ).toEqual([...defNames]);
        if (read.document !== undefined) {
          expectRefsClosed(`${label} [${position}]`, read.document);
        }
      }
    });
  }

  it("RED (a3): `Triage | array<integer>`'s `$defs.Triage` is the declaration's own closed lowering", () => {
    const read = readAt("alias", "Triage | array<integer>");
    const defs = (read.document?.["$defs"] ?? {}) as Record<string, unknown>;
    expect(
      defs["Triage"],
      `a3: the named arm's target must be the fragment the declaration lowers to, or the ` +
        `\`anyOf\` variant asserts nothing; observed ${JSON.stringify(defs["Triage"])}`,
    ).toEqual(TRIAGE_DEF);
  });
});

// ===========================================================================
// (b) THE `array<…>`-HEADED SPELLING — the concrete WRONG type
// `{"type":"array","items":{}}`, which rejects values the declared union admits.
// RED at HEAD: every position lowers that fragment.
// ===========================================================================

describe("bug 0043 (b) — an `array`-headed union lowers each arm, not one mis-sliced `array`", () => {
  const rows: ReadonlyArray<readonly [string, string, Record<string, unknown>, readonly string[]]> =
    [
      [
        "b1 `array<string> | array<integer>`",
        "array<string> | array<integer>",
        STRARRAY_OR_INTARRAY,
        [],
      ],
      ["b2 `array<string> | integer | array<boolean>`", THREE_ARM_SOURCE, THREE_ARM, []],
      ["b3 `array<Cat> | array<Dog>`", "array<Cat> | array<Dog>", CATARRAY_OR_DOGARRAY, ["Cat", "Dog"]],
    ];

  for (const [label, source, expected, defNames] of rows) {
    for (const position of POSITIONS) {
      it(`RED (${label} @ ${position}): each arm lowers on its own terms`, () => {
        const fragment = fragmentOf(label, position, source);
        expect(
          fragment,
          `${label} [${position}]: the mis-sliced single-argument \`array\` branch ` +
            `(params.ts:399–401) emits arrayness while dropping every arm the author wrote; ` +
            `SUBS-1 requires the \`anyOf\`. observed=${JSON.stringify(fragment)}`,
        ).toEqual(expected);
      });
    }

    // PARITY, not RED — see the identical cell in group (a).
    it(`PARITY (${label}): the four positions agree byte for byte`, () => {
      const observed = POSITIONS.map((position) => fragmentOf(label, position, source));
      for (const [i, position] of POSITIONS.entries()) {
        expect(
          observed[i],
          `${label}: type-system.md:15 — one type grammar per position; ${position} lowered ` +
            `${JSON.stringify(observed[i])} against alias's ${JSON.stringify(observed[0])}`,
        ).toEqual(observed[0]);
      }
    });

    it(`RED (${label}): the names inside the arms are registered and every \`$ref\` closes`, () => {
      for (const position of POSITIONS) {
        const read = readAt(position, source);
        expect(
          read.defNames,
          `${label} [${position}]: today the whole union is one mis-sliced argument, so a name ` +
            `inside it registers NOTHING — \`array<Cat> | array<Dog>\` loses both \`$defs\` ` +
            `entries; observed $defs keys=${JSON.stringify(read.defNames)}`,
        ).toEqual([...defNames]);
        if (read.document !== undefined) {
          expectRefsClosed(`${label} [${position}]`, read.document);
        }
      }
    });
  }

  it("RED (b4): `array<Cat> | array<Dog>`'s two `$defs` entries are the declarations' own lowerings", () => {
    const read = readAt("annotation", "array<Cat> | array<Dog>");
    const defs = (read.document?.["$defs"] ?? {}) as Record<string, unknown>;
    expect(
      { Cat: defs["Cat"], Dog: defs["Dog"] },
      `b4: nothing in today's lowered document mentions \`Cat\` or \`Dog\` at all; ` +
        `observed ${JSON.stringify(defs)}`,
    ).toEqual({ Cat: CAT_DEF, Dog: DOG_DEF });
  });
});

// ===========================================================================
// (c) THE REVERSED-ARM MIRRORS — green at HEAD, and the reason every expected
// value above is reachable: the same lowerer, the same `lowerUnion`, the same
// `$defs` closure, reached because the source text does not end in `>`.
// Any of these turning red means the reorder broke the path it was meant to
// route ONTO, not the path it was meant to route off.
// ===========================================================================

describe("bug 0043 (c) — the reversed-arm mirrors already lower SUBS-1 and must not move", () => {
  const rows: ReadonlyArray<readonly [string, string, Record<string, unknown>, readonly string[]]> =
    [
      [
        "c1 `array<integer> | integer`",
        "array<integer> | integer",
        { anyOf: [{ type: "array", items: { type: "integer" } }, { type: "integer" }] },
        [],
      ],
      [
        "c2 `array<integer> | Triage`",
        "array<integer> | Triage",
        { anyOf: [{ type: "array", items: { type: "integer" } }, { $ref: "#/$defs/Triage" }] },
        ["Triage"],
      ],
      [
        "c3 `integer | array<string> | string` (a generic that is not LAST)",
        "integer | array<string> | string",
        {
          anyOf: [
            { type: "integer" },
            { type: "array", items: { type: "string" } },
            { type: "string" },
          ],
        },
        [],
      ],
      [
        "c4 `array<string> | null`",
        "array<string> | null",
        { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
        [],
      ],
      ["c5 `integer | string` (all-primitive)", "integer | string", { type: ["integer", "string"] }, []],
      [
        "c6 `Cat | Dog` (named-only)",
        "Cat | Dog",
        { anyOf: [{ $ref: "#/$defs/Cat" }, { $ref: "#/$defs/Dog" }] },
        ["Cat", "Dog"],
      ],
    ];

  for (const [label, source, expected, defNames] of rows) {
    it(`CONTROL (${label}): unchanged at all four positions`, () => {
      for (const position of POSITIONS) {
        const fragment = fragmentOf(label, position, source);
        expect(
          fragment,
          `${label} [${position}]: this source reaches the union split TODAY, so the reorder ` +
            `must leave it byte-identical; observed ${JSON.stringify(fragment)}`,
        ).toEqual(expected);
        const read = readAt(position, source);
        expect(
          read.defNames,
          `${label} [${position}]: its \`$defs\` closure must not move either; observed ` +
            `${JSON.stringify(read.defNames)}`,
        ).toEqual([...defNames]);
      }
    });
  }
});

// ===========================================================================
// (d) REAL AJV OVER THE LOWERED DOCUMENTS. The lowered bytes are the only
// validation a `params:` argument or a typed response gets
// (query-failure-and-repair.md:78, QRY-22), so the accept/reject table is the
// consequence the byte pins above only describe.
// RED at HEAD: d1's document accepts everything; d2's REJECTS `{"p":3}`, which
// the declared `integer` arm admits, and ACCEPTS `{"p":[{"junk":1}]}`, which no
// arm admits.
// ===========================================================================

describe("bug 0043 (d) — the lowered document actually constrains the value set", () => {
  it("RED (d1): `schema M = integer | array<integer>` accepts exactly the two arms", () => {
    const read = readAt("alias", "integer | array<integer>");
    const document = read.document;
    if (document === undefined) {
      throw new Error(
        `d1: the fixture must load and lower. Diagnostics: ${JSON.stringify(read.diags)}`,
      );
    }
    expectRefsClosed("d1", document);
    const { validator, emitted } = ajv();
    const compiled = validator.compile(document);
    const rows: ReadonlyArray<readonly [Record<string, unknown>, boolean, string]> = [
      [{ a: 3 }, true, "the `integer` arm"],
      [{ a: [1, 2] }, true, "the `array<integer>` arm"],
      [{ a: "not an integer" }, false, "matches NEITHER arm"],
      [{ a: { nope: true } }, false, "matches NEITHER arm"],
      [{ a: null }, false, "matches NEITHER arm"],
      [{ a: [{ deep: 1 }] }, false, "an array whose elements are not integers"],
      [{ a: ["s"] }, false, "an array of strings is not `array<integer>`"],
    ];
    for (const [payload, ok, why] of rows) {
      const result = compiled.validate(payload);
      expect(
        result.ok,
        `d1 ${JSON.stringify(payload)} — ${why}. With \`$defs.M = {}\` the envelope accepts ` +
          `every JSON value for a param declared as this union; observed ${JSON.stringify(result)}`,
      ).toBe(ok);
    }
    expect(
      emitted.map((d) => d.code),
      "d1: one compile of one document raises no validator diagnostic",
    ).toEqual([]);
  });

  it("RED (d2): `array<string> | integer | array<boolean>` accepts `3` and refuses `[1,2]`", () => {
    const read = readAt("params", THREE_ARM_SOURCE);
    const document = read.document;
    if (document === undefined) {
      throw new Error(
        `d2: the fixture must load and lower. Diagnostics: ${JSON.stringify(read.diags)}`,
      );
    }
    expectRefsClosed("d2", document);
    const { validator, emitted } = ajv();
    const compiled = validator.compile(document);
    const rows: ReadonlyArray<readonly [Record<string, unknown>, boolean, string]> = [
      [{ p: ["a"] }, true, "the `array<string>` arm"],
      [{ p: [true] }, true, "the `array<boolean>` arm"],
      [
        { p: 3 },
        true,
        "the declared `integer` arm — TODAY REJECTED, the inverting cell: the mis-sliced " +
          "`{\"type\":\"array\",\"items\":{}}` refuses a value the author's own declaration admits",
      ],
      [
        { p: [1, 2] },
        false,
        "`array<integer>` is NOT declared — today accepted through `items: {}`",
      ],
      [
        { p: [{ junk: 1 }] },
        false,
        "matches NO arm — today accepted through `items: {}`",
      ],
      [{ p: "hi" }, false, "matches no arm in either lowering"],
    ];
    for (const [payload, ok, why] of rows) {
      const result = compiled.validate(payload);
      expect(
        result.ok,
        `d2 ${JSON.stringify(payload)} — ${why}; observed ${JSON.stringify(result)}`,
      ).toBe(ok);
    }
    expect(
      emitted.map((d) => d.code),
      "d2: one compile of one document raises no validator diagnostic",
    ).toEqual([]);
  });

  it("RED (d3): `array<Cat> | array<Dog>` discriminates the two element shapes", () => {
    const read = readAt("params", "array<Cat> | array<Dog>");
    const document = read.document;
    if (document === undefined) {
      throw new Error(
        `d3: the fixture must load and lower. Diagnostics: ${JSON.stringify(read.diags)}`,
      );
    }
    expectRefsClosed("d3", document);
    const { validator } = ajv();
    const compiled = validator.compile(document);
    const rows: ReadonlyArray<readonly [Record<string, unknown>, boolean, string]> = [
      [{ p: [{ kind: "cat" }] }, true, "the `array<Cat>` arm"],
      [{ p: [{ kind: "dog" }] }, true, "the `array<Dog>` arm"],
      [
        { p: [{ kind: "bird" }] },
        false,
        "neither variant's `const` discriminator matches — today accepted through `items: {}`",
      ],
      [{ p: 3 }, false, "not an array under either arm"],
    ];
    for (const [payload, ok, why] of rows) {
      const result = compiled.validate(payload);
      expect(
        result.ok,
        `d3 ${JSON.stringify(payload)} — ${why}; observed ${JSON.stringify(result)}`,
      ).toBe(ok);
    }
  });
});

// ===========================================================================
// (e) THE SWALLOWED NAME — `theta/parse/unresolved-named-type` parity across
// the `Ghost` triple at all four positions. `Ghost` is declared nowhere; the
// same name one arm along already raises, which is what makes this a parity
// claim rather than a new diagnostic.
// RED at HEAD: only `integer | array<Ghost>` raises. The `array`-headed pair
// raises NOTHING, because the mis-sliced argument is never identifier-shaped
// and `lowerCtx.unresolved` is never appended to.
// ===========================================================================

describe("bug 0043 (e) — a name in ANY arm of ANY spelling raises unresolved-named-type", () => {
  const EXPECTED = [unresolvedLine("Ghost")];

  // e1 is the REFERENCE row — green at HEAD, and the byte-identical rendering
  // e2 and e3 must reach. e2/e3 are the red pair.
  const triple: ReadonlyArray<readonly [string, string, string]> = [
    ["e1 `integer | array<Ghost>`", "integer | array<Ghost>", "CONTROL"],
    ["e2 `array<Ghost> | array<integer>`", "array<Ghost> | array<integer>", "RED"],
    ["e3 `array<integer> | array<Ghost>`", "array<integer> | array<Ghost>", "RED"],
  ];

  for (const [label, source, disposition] of triple) {
    for (const position of POSITIONS) {
      it(`${disposition} (${label} @ ${position}): exactly one diagnostic, naming Ghost`, () => {
        const read = readAt(position, source);
        expect(
          read.diags,
          `${label} [${position}]: code-registry-parse.md's ` +
            `\`${UNRESOLVED}\` row triggers on any \`NamedType\` resolving to no declaration ` +
            `usable at the position it is written, and each arm lowers through the identifier ` +
            `arm (params.ts:435–444); observed ${JSON.stringify(read.diags)}`,
        ).toEqual(EXPECTED);
      });
    }
  }

  it("CONTROL (e4): the same three sources with `Ghost` replaced by a DECLARED name load clean", () => {
    // The other half of the raise contract: the fix must not refuse the correct
    // declaration while it starts refusing the typo'd one.
    const clean = [
      "integer | array<Triage>",
      "array<Triage> | array<integer>",
      "array<integer> | array<Triage>",
    ];
    for (const source of clean) {
      for (const position of POSITIONS) {
        const read = readAt(position, source);
        expect(
          read.diags,
          `e4 [${position}] \`${source}\`: grammar.md:99 admits this declaration, so it must ` +
            `keep loading clean; observed ${JSON.stringify(read.diags)}`,
        ).toEqual([]);
      }
    }
  });
});

// ===========================================================================
// (f) THE RESPOND-TOOL SLUG. Under bug 0099 route A, `respondSchemaSlug`
// (src/runtime/typed-query-validation.ts) hashes the CANONICAL form
// (schema-subset.md §Canonical schema hash step 2), not the emitted
// serialisation, and names the registered `__theta_respond_<slug>` tool, so
// every annotation that lowers `{}` registers under ONE name.
// The expected slugs are recomputed here from the expected FRAGMENTS' own
// CANONICAL forms with `node:crypto` rather than read off the implementation,
// so the cell states the recipe as well as the value.
// `PERMISSIVE_SLUG` does not move: `{}` has no keys to sort, so its canonical
// form equals its emission. `MIS_SLICED_ARRAY_SLUG` re-derives under bug 0099:
// the collapsed fragment is `{"type":"array","items":{}}`, whose canonical form
// sorts `items` (U+0069) before `type` (U+0074).
// RED at HEAD: (f1) hashes 44136fa355b3678a, (f2) hashes 5483e69d7515873a.
// ===========================================================================

describe("bug 0043 (f) — an affected annotation stops colliding on the permissive-`{}` slug", () => {
  /** The slug every `{}`-lowering annotation collapses onto today; `{}` has no keys to sort. */
  const PERMISSIVE_SLUG = "44136fa355b3678a";
  /**
   * The slug every `{"type":"array","items":{}}`-lowering annotation collapses
   * onto today, under bug 0099's canonical-form recipe: canonical form
   * `{"items":{},"type":"array"}` (`items` sorts before `type`), SHA-256
   * truncated to 16 hex.
   */
  const MIS_SLICED_ARRAY_SLUG = "5483e69d7515873a";

  /**
   * Compare by Unicode CODE POINT, as schema-subset.md:100 pins — `<` compares
   * UTF-16 code units, which diverges from code-point order across the
   * surrogate range. Implemented locally, not imported, so this stays an oracle
   * independent of the implementation it checks.
   */
  function compareCodePointLocal(a: string, b: string): number {
    const ap = [...a];
    const bp = [...b];
    for (let i = 0; i < Math.min(ap.length, bp.length); i += 1) {
      const x = ap[i]?.codePointAt(0) ?? 0;
      const y = bp[i]?.codePointAt(0) ?? 0;
      if (x !== y) {
        return x - y;
      }
    }
    return ap.length - bp.length;
  }

  /**
   * A local keys-sorted, whitespace-free serialiser over the plain-object
   * domain these fragments inhabit (schema-subset.md:99–:105's non-numeric
   * clauses; no fragment here carries a numeric `const`/`enum`). Written here
   * rather than imported so a change to the implementation cannot move the
   * oracle with it (bug 0099 route A).
   */
  function canonicalSerialise(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map(canonicalSerialise).join(",")}]`;
    }
    if (typeof value === "object" && value !== null) {
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        compareCodePointLocal(a, b),
      );
      return `{${entries
        .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalSerialise(entryValue)}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  /** The registered-tool slug recipe: SHA-256 of the CANONICAL form, first 16 hex (bug 0099). */
  function slugOf(fragment: unknown): string {
    return createHash("sha256").update(canonicalSerialise(fragment)).digest("hex").slice(0, 16);
  }

  const rows: ReadonlyArray<readonly [string, string, Record<string, unknown>, string]> = [
    ["f1 `integer | array<integer>`", "integer | array<integer>", INT_OR_INTARRAY, PERMISSIVE_SLUG],
    [
      "f2 `array<string> | array<integer>`",
      "array<string> | array<integer>",
      STRARRAY_OR_INTARRAY,
      MIS_SLICED_ARRAY_SLUG,
    ],
  ];

  for (const [label, source, expected, collapsedSlug] of rows) {
    it(`RED (${label}): the slug is the corrected schema's, not the collapsed one`, () => {
      const decls = schemaDeclsOf(DECLS);
      const lowered = lowerQueryResponseSchema(source, decls.schemas, decls.enums);
      if (lowered === undefined) {
        throw new Error(`${label}: \`@<${source}>\` lowered to nothing, so no tool can be named`);
      }
      const observed = respondSchemaSlug(lowered);
      expect(
        observed,
        `${label}: every distinct annotation lowering to the same permissive fragment registers ` +
          `under the SINGLE tool name \`__theta_respond_${collapsedSlug}\`, and the PIC-44 ` +
          `registration cache reuses the first registration by construction; observed ${observed}`,
      ).not.toBe(collapsedSlug);
      expect(
        observed,
        `${label}: the slug must be the hash of the SUBS-1 fragment the author declared; ` +
          `expected ${slugOf(expected)} over ${JSON.stringify(expected)}, observed ${observed} ` +
          `over ${JSON.stringify(lowered)}`,
      ).toBe(slugOf(expected));
    });
  }

  it("CONTROL (f3): the two corrected slugs differ from each other", () => {
    // Without this the inequality above could hold while both annotations still
    // shared one name under a different collapsed fragment.
    expect(
      slugOf(INT_OR_INTARRAY),
      `f3: two distinct declared schemas must name two distinct respond tools; observed ` +
        `${slugOf(INT_OR_INTARRAY)} and ${slugOf(STRARRAY_OR_INTARRAY)}`,
    ).not.toBe(slugOf(STRARRAY_OR_INTARRAY));
  });
});

// ===========================================================================
// (g) THE SINGLE-TERM PATH AND THE LITERAL SUBLANGUAGE — no-op cells. The
// reorder is a no-op for every source without a top-level `|`
// (`splitTopLevel(s, "|")` tracks angle depth, params.ts), so each of these
// keeps its exact bytes. Reading the union split as unconditional is the
// mutation this group catches.
// ===========================================================================

describe("bug 0043 (g) — a source with no top-level `|` is byte-unchanged", () => {
  const rows: ReadonlyArray<readonly [string, string, Record<string, unknown>]> = [
    ["g1 `array<integer>`", "array<integer>", { type: "array", items: { type: "integer" } }],
    [
      "g2 `array<integer|string>` (the `|` is INSIDE the angles)",
      "array<integer|string>",
      { type: "array", items: { type: ["integer", "string"] } },
    ],
    [
      "g4 `array<{x: integer, y: string}>` (two arguments, so the `array` arm declines)",
      "array<{x: integer, y: string}>",
      {},
    ],
  ];

  for (const [label, source, expected] of rows) {
    it(`CONTROL (${label}): unchanged at all four positions`, () => {
      for (const position of POSITIONS) {
        const fragment = fragmentOf(label, position, source);
        expect(
          fragment,
          `${label} [${position}]: no top-level \`|\`, so the reordering cannot reach it; ` +
            `observed ${JSON.stringify(fragment)}`,
        ).toEqual(expected);
      }
    });
  }

  it("CONTROL (g3 `array<{}>`): unchanged at the positions bug 0045 does not refuse", () => {
    // Bug 0045 §Fix wires the empty-inline-object rule into every
    // `parseTypeExpression` call, so `array<{}>`'s element type is refused at
    // the `params:` position now too (g3b below) — joining `alias` and `field`,
    // whose own refusal is a body-position diagnostic that does not null the
    // fragment this cell reads. `annotation` calls the lowerer directly
    // (bypassing the parse gate), so its fragment is equally unmoved. None of
    // the three positions below runs the reorder this describe block is about.
    for (const position of ["alias", "field", "annotation"] as const) {
      const fragment = fragmentOf("g3 `array<{}>`", position, "array<{}>");
      expect(
        fragment,
        `g3 [${position}]: no top-level \`|\`, so the reordering cannot reach it; ` +
          `observed ${JSON.stringify(fragment)}`,
      ).toEqual({ type: "array", items: {} });
    }
  });

  it("CONTROL (g3b `array<{}>`): the `params:` position now refuses the empty element", () => {
    // grammar.md:109's empty-inline-object rule is unqualified by nesting
    // depth, so `array<{}>`'s element type is refused exactly as a bare `{}`
    // is (bug 0045 §Fix); `theta/parse/empty-schema-body` joins `alias` and
    // `field`, which already carry the same diagnostic for this source.
    // The whole ordered list against the registry-sourced line, not a code
    // substring: DIAG-4 fixes the *Message* character-for-character, so a
    // reworded row or a second diagnostic joining it has to red here too.
    const read = readAt("params", "array<{}>");
    expect(
      read.diags,
      `g3b [params]: bug 0045 §Fix refuses an empty inline object at every position and every ` +
        `nesting depth, naming the author's own two bytes; observed ${JSON.stringify(read.diags)}`,
    ).toEqual([emptySchemaBodyLine("{}")]);
    expect(
      read.document,
      "g3b [params]: an error-severity params diagnostic withholds the lowered document",
    ).toBeUndefined();
  });

  it("CONTROL (g5): `Result<integer, string>` stays permissive at the positions that do not refuse it", () => {
    // Bug 0044 §Fix wires `parseTypeExpression(…, "schema-feeding")` at the
    // `params:` position too — a registered trigger implemented, not widened:
    // `result-in-schema-position`'s row (code-registry-parse.md:60) and
    // grammar.md §Type grammar both already name "a `params:` field type" among
    // its trigger positions, exactly as :59 does for `void`. So `params:` now
    // refuses this bare source outright, joining `alias` and `field`, and only
    // `annotation` still has no top-level `|` AND no refusal to reach it.
    for (const position of ["alias", "field", "annotation"] as const) {
      const fragment = fragmentOf(
        "g5 `Result<integer, string>`",
        position,
        "Result<integer, string>",
      );
      expect(
        fragment,
        `g5 [${position}]: no top-level \`|\`, so the reordering cannot reach it; ` +
          `observed ${JSON.stringify(fragment)}`,
      ).toEqual({});
    }
  });

  it("CONTROL (g6): `Result<integer, string>` keeps its `result-in-schema-position` refusal", () => {
    // The generic arm is not silent for every input that reaches it: the parse
    // gate refuses this one first, at the three positions that run it —
    // `params:` joins `alias` and `field` because the registry row already
    // names it (code-registry-parse.md:60), so wiring it there (bug 0044 §Fix)
    // implements a registered trigger rather than widening one.
    for (const position of ["alias", "field", "params"] as const) {
      const read = readAt(position, "Result<integer, string>");
      expect(
        read.diags.filter((line) => line.includes(RESULT_IN_SCHEMA)).length,
        `g6 [${position}]: grammar.md:107's closed constructor set refuses \`Result\` in a ` +
          `schema-feeding position; observed ${JSON.stringify(read.diags)}`,
      ).toBe(1);
    }
  });

  it("CONTROL (g7): the LITERAL union `\"x\" | \"y\"` lowers alike at all four positions", () => {
    // All four positions run the same literal check now: bug 0056 §Fix
    // constraint 1 moved the recogniser and ONE shared emission helper into
    // `params.ts`, and `lowerParamsFieldType` calls them ahead of its brace test
    // (docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md),
    // so the `params:` position carries schema-subset.md:80's spelled emission
    // the other three have carried since bug 0055 §Fix landed. Neither spelling
    // carries a `<`, so the generic arm never fires and the reorder this
    // describe block is about moves nothing here either way.
    for (const position of POSITIONS) {
      const fragment = fragmentOf("g7", position, '"x" | "y"');
      expect(
        fragment,
        `g7 [${position}]: schema-subset.md:80's literal-union emission — a string-literal ` +
          `union is \`LiteralType\` arms (grammar.md:102), not the \`PrimitiveType\` arms ` +
          `SUBS-1 (:81) governs; observed ${JSON.stringify(fragment)}`,
      ).toEqual({ type: "string", enum: ["x", "y"] });
    }
  });

  it("CONTROL (g8): a LITERAL arm of a mixed union lowers its `const`, while the named arm keeps its `$ref`, at all four positions", () => {
    // Named by §Non-goals, and still held there after bug 0056: the all-arms
    // literal test declines a union carrying a non-literal arm at EVERY
    // position, so `"a"` beside a named arm reaches `lowerTypeExpr`'s per-arm
    // recursion — the shape g7's move does not reach. The union already splits
    // (no `<`), so the reorder does not reach it either.
    //
    // WHAT MOVED, AND WHAT DID NOT. Bug 0184 §Fix routes that per-arm recursion
    // through the same literal sublanguage (gated to the MIXED arm set), so the
    // `{}` variant this cell pinned is now schema-subset.md:79's
    // `{ "const": "a" }`. The mechanism above is unchanged and so is this cell's
    // subject — a literal arm of a mixed union, at all four positions, untouched
    // by the generic-arm reorder this describe block is about. Bug 0184 §Fix is
    // the authority that lifted the disposition; the earlier "unfiled" reading
    // is what it replaced (bug 0043 §Non-goals is a CLOSED document, which is
    // why no open report owned the shape until 0184).
    for (const position of POSITIONS) {
      const fragment = fragmentOf("g8", position, '"a" | Triage');
      expect(
        fragment,
        `g8 [${position}]: the literal ARM lowers schema-subset.md:79's \`const\` and the named ` +
          `arm keeps resolving to its own \`$defs\` entry (bug 0184 §Fix; formerly "unfiled and ` +
          `unchanged here" under bug 0043 §Non-goals); observed ${JSON.stringify(fragment)}`,
      ).toEqual({ anyOf: [{ const: "a" }, { $ref: "#/$defs/Triage" }] });
    }
  });
});

// ===========================================================================
// (h) LEGAL RECURSION — bug 0033's own cell n25 fixture sits on the losing side
// of the arm order. `schema X = integer | array<X>` loads clean and defers
// typing "to the runtime AJV net"; that net is `$defs.X = {}`.
// RED at HEAD: h1 lowers `{}`. h2 is its reversed-arm mirror, green today.
// ===========================================================================

describe("bug 0043 (h) — `array`-guarded recursion lowers a self-`$ref` `anyOf`", () => {
  /** SUBS-1 over `integer | array<X>` with the self reference intact. */
  const RECURSIVE_UNION = {
    anyOf: [{ type: "integer" }, { type: "array", items: { $ref: "#/$defs/X" } }],
  };

  /** A `params:` document whose one field names the self-recursive alias `X`. */
  function recursiveDoc(label: string, rhs: string): LoweredSchema {
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n  a: X\n---\nschema X = ${rhs}\nlet inert = 1\ninert\n`,
      "bug0043.theta",
    );
    expect(
      diagLines(doc),
      `${label}: schemas.md:147 forbids the PURE-alias cycle, not recursion guarded by a ` +
        `structural constructor, so \`schema X = ${rhs}\` must load clean; observed ` +
        `${JSON.stringify(diagLines(doc))}`,
    ).toEqual([]);
    const document = loweredParamsDocument(doc);
    if (document === undefined) {
      throw new Error(
        `${label}: the params block lowered to NOTHING. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
      );
    }
    return document as LoweredSchema;
  }

  it("RED (h1): `schema X = integer | array<X>` + `params a: X` lowers the self-`$ref` `anyOf`", () => {
    const document = recursiveDoc("h1", "integer | array<X>");
    const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
    expect(
      defs["X"],
      `h1: schema-subset.md:76 emits the root-absolute pointer back to the alias's own ` +
        `\`$defs\` entry, and :81 combines it with the primitive arm; bug 0033 cell n25 ` +
        `(tests/schema-alias-union-decl.test.ts) defers typing to this fragment. observed ` +
        `${JSON.stringify(defs["X"])}`,
    ).toEqual(RECURSIVE_UNION);
    expectRefsClosed("h1", document);

    const { validator } = ajv();
    const compiled = validator.compile(document);
    const rows: ReadonlyArray<readonly [Record<string, unknown>, boolean, string]> = [
      [{ a: 3 }, true, "the `integer` arm"],
      [{ a: [] }, true, "the recursion's base case"],
      [{ a: [3, [4]] }, true, "an element may be an integer or another such array"],
      [{ a: "no" }, false, "matches neither arm — today accepted through `$defs.X = {}`"],
      [{ a: [{ nope: 1 }] }, false, "an object is neither arm at depth"],
    ];
    for (const [payload, ok, why] of rows) {
      const result = compiled.validate(payload);
      expect(
        result.ok,
        `h1 ${JSON.stringify(payload)} — ${why}; observed ${JSON.stringify(result)}`,
      ).toBe(ok);
    }
  });

  it("CONTROL (h2): the reversed `schema X = array<X> | integer` is byte-identical bar arm order", () => {
    const document = recursiveDoc("h2", "array<X> | integer");
    const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
    expect(
      defs["X"],
      `h2: the same two arms reached through the union split TODAY — the mirror that makes ` +
        `h1's expectation reachable; observed ${JSON.stringify(defs["X"])}`,
    ).toEqual({
      anyOf: [{ type: "array", items: { $ref: "#/$defs/X" } }, { type: "integer" }],
    });
  });

  it("CONTROL (h3): `schema X = array<X>` (no top-level `|`) is unchanged", () => {
    const document = recursiveDoc("h3", "array<X>");
    const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
    expect(
      defs["X"],
      `h3: bug 0033 cell n26's fragment — a single term, so the reorder cannot reach it; ` +
        `observed ${JSON.stringify(defs["X"])}`,
    ).toEqual({ type: "array", items: { $ref: "#/$defs/X" } });
  });
});

// ===========================================================================
// (i) THE BRACE-ARM SPELLING — re-derived against the dispatch every position
// runs, which the bug doc's §Reproduction (written at 0.45.0, before bug 0039
// landed in 0.49.0) predates. One structural predicate and one arm path serve
// all four positions: `isSingleEnclosingBraceGroup` and
// `lowerBraceGroupUnionArms` (both src/parser/params.ts), asked by
// `lowerTypeSource` for the alias, annotation and schema-body positions and by
// `lowerParamsFieldType` for `params:` (bug 0097 §Fix). A union whose segments
// are brace-balanced and one of which is a single enclosing brace group
// therefore hoists that arm at every position, and the four agree byte for
// byte.
//
// WHAT THE LABELS MEAN IN THIS GROUP. CONTROL (i1) is the pair that already
// lowered these bytes when bug 0043 was filed and has not moved since — the
// reference the other two cells are compared against. RED (i2) and RED (i3)
// are the cells that were red at that HEAD and are green now, each on a named
// authority: i2 on bug 0097 §Fix, which replaced `lowerParamsFieldType`'s
// positional brace test with the shared structural one; i3 on bug 0095 §Fix,
// which made `parseType` consume the whole `Type ("|" Type)*` extent at every
// position so a schema-body field keeps its field list.
// ===========================================================================

describe("bug 0043 (i) — the brace-arm union, whose four positions agree byte for byte", () => {
  const SOURCE = "{a: integer} | array<integer>";

  /**
   * The hoisted key for `{a: integer}`, derived from a hand-written canonical
   * form (schema-subset.md §Canonical schema hash) rather than read off the
   * implementation, so the pin does not take its oracle from what it tests.
   */
  const A_INT_CANONICAL =
    '{"additionalProperties":false,"properties":{"a":{"type":"integer"}},"required":["a"],"type":"object"}';
  const A_INT_INLINE = `__inline_${createHash("sha256").update(A_INT_CANONICAL, "utf8").digest("hex").slice(0, 16)}`;

  /** Bug 0039's arm dispatch: the brace arm hoists, the generic arm lowers concretely. */
  const HOISTED = {
    anyOf: [{ $ref: `#/$defs/${A_INT_INLINE}` }, { type: "array", items: { type: "integer" } }],
  };

  it("CONTROL (i1): the alias and annotation positions already lower the hoisted `anyOf`", () => {
    for (const position of ["alias", "annotation"] as const) {
      const fragment = fragmentOf("i1", position, SOURCE);
      expect(
        fragment,
        `i1 [${position}]: bug 0039 §Fix part B dispatches the arms before \`lowerTypeExpr\` is ` +
          `reached, so these bytes are correct at HEAD and must not move; observed ` +
          `${JSON.stringify(fragment)}`,
      ).toEqual(HOISTED);
    }
  });

  it("RED (i2): the `params:` position lowers the hoisted `anyOf` — the brace arm hoists and `array<integer>` survives", () => {
    // `lowerParamsFieldType` asks `isSingleEnclosingBraceGroup` in place of its
    // former positional `startsWith("{") && endsWith("}")` test (bug 0097
    // §Fix), so this source — a union whose two segments are both
    // brace-balanced and whose first is itself a single enclosing brace
    // group — takes `lowerBraceGroupUnionArms` (src/parser/params.ts): the
    // first arm hoists through `hoistInlineObjectType` and the second lowers
    // through `lowerTypeExpr`, exactly as bug 0039 §Fix part B already
    // dispatches the alias and annotation positions' arms (i1).
    // `array<integer>` was never at risk of being discarded — bug 0043's own
    // fix keeps the union split ahead of the generic-application test at every
    // position — what this pins is the FIRST arm, which hoists rather than
    // lowering permissively.
    const fragment = fragmentOf("i2", "params", SOURCE);
    expect(
      fragment,
      `i2 [params]: SUBS-1 requires an \`anyOf\` over both arms, the object arm hoisted and the ` +
        `\`array<integer>\` arm intact — byte-identical to what i1 pins at the alias and ` +
        `annotation positions; observed ${JSON.stringify(fragment)}`,
    ).toEqual(HOISTED);
  });

  it("RED (i3): the schema-body FIELD position joins the parity — it loads, and it lowers the same hoisted `anyOf`", () => {
    // The four-position parity claim i1 makes at the alias and annotation
    // positions, extended to the third. A schema field type consumes the whole
    // `Type ("|" Type)*` extent (grammar.md:94, :105), so this declaration
    // captures one field whose type source is the union, the load is clean, and
    // the same arm dispatch bug 0039 §Fix part B installed produces the same
    // bytes here as at i1's two positions — one lowerer, one `$defs` closure,
    // one inline hoist key.
    const read = readAt("field", SOURCE);
    expect(
      read.diags,
      `i3: \`schema S { a: ${SOURCE} }\` is ordinary grammar — a brace-group arm beside a ` +
        `generic arm, neither of them empty — so no parse diagnostic has a subject and the ` +
        `field's type reaches lowering`,
    ).toEqual([]);
    const fragment = fragmentOf("i3", "field", SOURCE);
    expect(
      fragment,
      `i3 [field]: type-system.md:15 makes this one type grammar in every annotation position, ` +
        `so the field position cannot lower a different shape from the alias and annotation ` +
        `positions i1 pins; observed ${JSON.stringify(fragment)}`,
    ).toEqual(HOISTED);
  });
});

// ===========================================================================
// (j) `string | Result<integer, string>` — listed as a control by the bug doc's
// §Reproduction, but re-derived here as INSIDE the changed set: it carries a
// top-level `|`, and §Fix defines the reorder as "a no-op for every source
// WITHOUT a top-level `|`". SUBS-1 gives a union with one non-primitive arm an
// `anyOf`, and the `Result` arm's own `{}` is one of the three permissive-arm-2
// triggers §Non-goals keeps.
// RED at HEAD: j1. j2 is the diagnostic half, green now and after.
// ===========================================================================

describe("bug 0043 (j) — a `Result` union arm keeps its `{}` as ONE variant", () => {
  const SOURCE = "string | Result<integer, string>";

  it("RED (j1): the primitive arm survives beside the permissive `Result` variant", () => {
    // Read at the one position that does NOT refuse the source. `@<Schema>` is
    // a type ASCRIPTION, so it is checked at `"value"`, not `"schema-feeding"`,
    // where grammar.md §Type grammar admits `Result` ("remains admitted in …
    // `invoke<Type>` / type-ascription contexts") — `params:` now joins
    // `alias` and `field` in refusing this source (bug 0044 §Fix wires
    // `parseTypeExpression(…, "schema-feeding")` there too), so only the
    // annotation position still has bytes for this cell to assert.
    for (const position of ["annotation"] as const) {
      const fragment = fragmentOf("j1", position, SOURCE);
      expect(
        fragment,
        `j1 [${position}]: schema-subset.md:81 — the \`string\` arm is not discarded by the ` +
          `arm the \`Result\` application takes; observed ${JSON.stringify(fragment)}`,
      ).toEqual({ anyOf: [{ type: "string" }, {}] });
    }
  });

  it("CONTROL (j2): the `result-in-schema-position` refusal does not move", () => {
    for (const position of ["alias", "field", "params"] as const) {
      const read = readAt(position, SOURCE);
      expect(
        read.diags.filter((line) => line.includes(RESULT_IN_SCHEMA)).length,
        `j2 [${position}]: the parse gate refuses \`Result\` in a schema-feeding position ` +
          `regardless of the lowering; observed ${JSON.stringify(read.diags)}`,
      ).toBe(1);
    }
  });
});
