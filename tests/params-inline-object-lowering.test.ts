import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { BypassParamsField } from "../src/binder/binder-envelope";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { lowerParamsFieldType, type LowerCtx } from "../src/parser/params";
import type { ThetaDocument } from "../src/parser/theta-document";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0035 — an inline object type on the `params:` right-hand side is
// discarded before it is lowered: `p: {a: Tirage, b: integer}` loads clean,
// lowers `properties.p = {}`, records the field's declared type as the empty
// string, and raises none of the `theta/parse/unresolved-named-type` its two
// sibling positions raise for byte-identical type text
// (docs/bugs/0035-params-rhs-inline-object-under-emission.md).
//
// Two independent frames drop the same declaration, so the fix needs both, and
// this file pins both:
//
//   1. `extractParsedParams` (src/parser/frontmatter.ts:645) reads only
//      `isScalar(item.value)` and substitutes `""` otherwise. YAML parses an
//      unquoted `{a: Tirage, b: integer}` as a flow mapping, so the author's
//      type expression is gone before `parseParams` runs (fixtures A / B / C).
//   2. `lowerTypeExpr` (src/parser/params.ts:291–341) has no inline-object arm,
//      so the brace text that DOES survive — the quoted RHS — falls past every
//      arm to the trailing `return {}` (fixtures F / F′).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schema-subset.md:73 — Lowering Algorithm step 2: hoist
//     "anonymous inline object schemas (`{ field: T }` appearing in any type
//     position)" into `$defs` under `__inline_<slug>`, where `<slug>` is the
//     schema slug of the LOWERED fragment; two inline schemas collapse to one
//     `$defs` entry exactly when their lowered fragments are byte-identical.
//   - :76 — step 3: a "named or inline schema reference" emits
//     `{ "$ref": "#/$defs/<Name>" }`. No spec text defines a `{}` emission for
//     any type form.
//   - §Canonical schema hash (:92–:108) — the slug recipe: canonical form with
//     object keys sorted by Unicode code point and no insignificant whitespace
//     (:99–:101), array elements left in lowering order (:104), RFC 8259
//     minimal string escapes (:105), SHA-256 (:106), first 16 lowercase hex
//     characters (:107).
//   - docs/spec_topics/grammar.md:109 — `ObjectType` is admitted "in any `Type`
//     position", its field `Type` is recursive (so nested inline objects
//     parse), and an empty `{}` is `theta/parse/empty-schema-body`.
//   - docs/spec_topics/type-system.md:15 — one type grammar in every
//     annotation position, `params:` named explicitly.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:58 — the `params:`
//     type side: "A `params:` named type that resolves to no such declaration
//     is the parse-time diagnostic `theta/parse/unresolved-named-type`".
//   - docs/spec_topics/diagnostics/code-registry-parse.md:89 — the
//     `theta/parse/unresolved-named-type` row, whose four positions name the
//     `params:` right-hand side FIRST. No registry edit is needed for this fix;
//     the row already names this position. (The bug doc cites `:88`; the row
//     has shifted one line since filing — same row, same *Message* column.)
//   - docs/spec_topics/governance/source-language-stability.md:25 (GOV-15
//     diagnostic-registry carve-out) — the newly-refused inputs (A / F) are a
//     covered trigger change within a 1.x minor.
//
// PROBED CURRENT SIGNATURES (HEAD 8ae94691 / 0.43.0, offline, deterministic,
// byte-identical to the bug doc's §Reproduction table at 0.38.0 — zero drift).
// Body fixture `schema Triage { urgent: boolean }` + `let x = 1`; frontmatter
// `mode: prompt` plus the single `params:` entry:
//   A  p: {a: Tirage, b: integer}    diags []  props {"p":{}}  field.type ""
//   B  p: {a: Triage, b: integer}    diags []  props {"p":{}}  field.type ""
//   C  p: {a: integer}               diags []  props {"p":{}}  field.type ""
//   D  p: Tirage                     ONE error unresolved-named-type, fm null
//   E  p: Triage                     props {"p":{"$ref":"#/$defs/Triage"}}
//   F  p: "{a: Tirage, b: integer}"  diags []  props {"p":{}}
//                                    field.type "{a: Tirage, b: integer}"
//   G  @<{a: Tirage, b: integer}>    ONE error unresolved-named-type
//   H  schema S { p: {a: Tirage…} }  ONE error unresolved-named-type
//   I  p: {}                         diags []  props {"p":{}}  field.type ""
//   DEDUP  p / q both {a: integer}   props {"p":{},"q":{}}     no $defs
//   MIXED  p: {a: Triage, b: {c: integer}}   props {"p":{}}
//   ARRAY  p: "array<{a: integer}>"  props {"p":{"type":"array","items":{}}}
//   BESIDE n: integer + p: {a: integer}
//                       props {"n":{"type":"integer"},"p":{}}
//   NESTED-MULTI p: {a: Triage, b: {x: integer, y: string}}  diags []
//                       props {"p":{}}  field.type ""
//   NESTED-TYPO  p: {a: Triage, b: {x: Tirage, y: string}}   diags []
//
// THE TWO NESTED-* ROWS also pin the INTERIOR SPLIT of a brace-rooted `params:`
// field. That interior is an inline-object FIELD LIST whose per-field `Type` is
// recursive (grammar.md:109), so a nested `ObjectType` is ONE field's type and
// the comma inside it is not an outer separator: brace depth must NEST there.
// Split the list on angle depth alone and `b: {x: integer, y: string}` becomes
// the two entries `b: {x: integer` and `y: string}` — two permissive `{}`
// properties, both `required`, one of them a phantom field name the author never
// declared at that level. The theta loads clean and the minted fragment then
// REJECTS the author's own payload while accepting the phantom shape (f2), and a
// typo one brace deep stays silent (a4).
//
// WHAT IS RED HERE AND WHY: groups (a)–(d), (f) and (g). Group (e) is green now
// and must stay green — the plain-named controls, the two sibling positions, the
// generic scope bounds, and the fail-closed unquoted `array<{…}>` form.
//
// THE SLUG ORACLE IS INDEPENDENT. `schemaSlug` (src/parser/schema-lowering.ts)
// is deliberately NOT imported: an oracle taken from the implementation under
// test proves nothing. Every expected `__inline_<slug>` below is derived from a
// HAND-WRITTEN canonical-form string following the §Canonical schema hash
// recipe, hashed with `node:crypto`. Group (0) cross-checks each hand-written
// string against the fragment it claims to serialise (parse-back equality, no
// whitespace, code-point-sorted keys at every level), so a typo in the oracle
// reds as an oracle failure rather than as a lowering failure.
//
// ONE OBSERVABILITY LIMIT worth stating: post-fix, fixtures A and F are REFUSED
// (an error-severity params diagnostic collapses the frontmatter to `null`, as
// fixture D already shows), so their `BypassParamsField.type` is unobservable
// after the fix. The recovered-surface-text claim is therefore pinned on the
// well-formed twins — B, C, F′ and I — in group (c); A and F pin the
// diagnostic in group (a).
//
// TIER: unit, offline, deterministic, provider-free. The whole contract is
// settled inside one function call — `parseThetaDocument` over a string — plus
// one real AJV compile of the schema that call produces. Nothing crosses a
// session, a child process, or a provider, so an integration or live tier
// would add a round-trip to a parse-time observable and could not assert a
// diagnostic's absence or a `$defs` key at all. `parseDoc`
// (tests/helpers/e2e-s1.ts) is the shipped load path wrapped in the standard
// inert `parseDeps` double (the same double tests/absent-member-presence-gate.test.ts
// builds locally), and it is the harness the bug doc's own §Reproduction used.
//
// NO SILENT SKIPPING: every fixture that must load asserts an empty diagnostic
// list and then fails LOUDLY — with the diagnostics rendered — if the
// frontmatter, the params block, or the lowered schema is absent. A refused
// parse can therefore never be mistaken for a pass.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

const CODE = "theta/parse/unresolved-named-type";

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
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${CODE}`,
  ).toBeDefined();
  return (template as string).replace("<name>", name);
}

/** The one rendered diagnostic line fixtures A / D / F / G / H must all produce. */
function unresolvedLine(name: string): string {
  return `error ${CODE}: ${unresolvedMessage(name)}`;
}

// ===========================================================================
// Fixtures. One body, one frontmatter shape, one `params:` entry per fixture —
// byte-identical to the bug doc's §Reproduction table.
// ===========================================================================

/** `Triage` is declared in every fixture; `Tirage` is declared nowhere. */
const BODY = "schema Triage { urgent: boolean }\nlet x = 1\n";

/** A `mode: prompt` theta whose `params:` block is `paramsBlock`. */
function src(paramsBlock: string, body: string = BODY): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${body}`;
}

/** The closed lowering of `schema Triage { urgent: boolean }`. */
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};

// The lowered fragments the inline objects hoist to (schema-subset.md:73 step 2
// via the Object emission rule of step 3: `type` / `properties` in declaring
// order / `required` over every wire name / `additionalProperties: false`).

/** Fixture B's fragment: `{a: Triage, b: integer}`. */
const B_FRAGMENT = {
  type: "object",
  properties: { a: { $ref: "#/$defs/Triage" }, b: { type: "integer" } },
  required: ["a", "b"],
  additionalProperties: false,
};

/** Fixture C's fragment: `{a: integer}`. */
const C_FRAGMENT = {
  type: "object",
  properties: { a: { type: "integer" } },
  required: ["a"],
  additionalProperties: false,
};

/** The MIXED fixture's INNER fragment: the nested `{c: integer}`. */
const MIXED_INNER_FRAGMENT = {
  type: "object",
  properties: { c: { type: "integer" } },
  required: ["c"],
  additionalProperties: false,
};

/**
 * The NESTED-MULTI fixture's INNER fragment: the nested `{x: integer, y: string}`.
 * TWO fields, so its interior carries the comma that an angle-only outer split
 * mistakes for an outer field separator.
 */
const NESTED_INNER_FRAGMENT = {
  type: "object",
  properties: { x: { type: "integer" }, y: { type: "string" } },
  required: ["x", "y"],
  additionalProperties: false,
};

// The hand-written canonical forms (§Canonical schema hash step 2): keys sorted
// by Unicode code point — `additionalProperties` < `properties` < `required` <
// `type` — no whitespace, array elements left in lowering order.
const B_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"$ref":"#/$defs/Triage"},"b":{"type":"integer"}},"required":["a","b"],"type":"object"}';
const C_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"integer"}},"required":["a"],"type":"object"}';
const MIXED_INNER_CANONICAL =
  '{"additionalProperties":false,"properties":{"c":{"type":"integer"}},"required":["c"],"type":"object"}';
const NESTED_INNER_CANONICAL =
  '{"additionalProperties":false,"properties":{"x":{"type":"integer"},"y":{"type":"string"}},"required":["x","y"],"type":"object"}';

// ===========================================================================
// The independent slug oracle (§Canonical schema hash steps 3–4).
// ===========================================================================

/** SHA-256 of the canonical-form bytes, first 16 lowercase hex characters. */
function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73). */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}

const B_INLINE = inlineDefName(B_CANONICAL);
const C_INLINE = inlineDefName(C_CANONICAL);
const MIXED_INNER_INLINE = inlineDefName(MIXED_INNER_CANONICAL);
const NESTED_INNER_INLINE = inlineDefName(NESTED_INNER_CANONICAL);

/**
 * The MIXED fixture's OUTER canonical form. Its `b` property is a `$ref` to the
 * inner hoisted def, so the outer slug depends on the inner slug — computed,
 * never hardcoded.
 */
const MIXED_OUTER_CANONICAL =
  `{"additionalProperties":false,"properties":{"a":{"$ref":"#/$defs/Triage"},` +
  `"b":{"$ref":"#/$defs/${MIXED_INNER_INLINE}"}},"required":["a","b"],"type":"object"}`;

const MIXED_OUTER_INLINE = inlineDefName(MIXED_OUTER_CANONICAL);

/** The MIXED fixture's outer fragment, in step-3 emission order. */
const MIXED_OUTER_FRAGMENT = {
  type: "object",
  properties: {
    a: { $ref: "#/$defs/Triage" },
    b: { $ref: `#/$defs/${MIXED_INNER_INLINE}` },
  },
  required: ["a", "b"],
  additionalProperties: false,
};

/**
 * The NESTED-MULTI fixture's OUTER canonical form and fragment. Two fields at
 * this level — `a` and `b` — and NO third: a `y` here is the nested object's
 * second field leaking through an angle-only interior split.
 */
const NESTED_OUTER_CANONICAL =
  `{"additionalProperties":false,"properties":{"a":{"$ref":"#/$defs/Triage"},` +
  `"b":{"$ref":"#/$defs/${NESTED_INNER_INLINE}"}},"required":["a","b"],"type":"object"}`;

const NESTED_OUTER_INLINE = inlineDefName(NESTED_OUTER_CANONICAL);

const NESTED_OUTER_FRAGMENT = {
  type: "object",
  properties: {
    a: { $ref: "#/$defs/Triage" },
    b: { $ref: `#/$defs/${NESTED_INNER_INLINE}` },
  },
  required: ["a", "b"],
  additionalProperties: false,
};

// ===========================================================================
// Load helpers. Loud on every unexpected disposition.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** A parsed, cleanly-lowered `params:` block. */
interface LoadedParams {
  readonly doc: ThetaDocument;
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly defs: Record<string, unknown>;
  readonly fields: readonly BypassParamsField[];
  readonly loweredSchema: LoweredSchema;
}

/**
 * Parse a fixture that must LOAD, and read its lowered `params:` schema back.
 *
 * The empty-diagnostic assertion runs first (a fixture in this group is correct
 * theta by grammar.md:109, so any diagnostic is the failure), and every absent
 * intermediate — a `null` frontmatter, an absent `params`, an absent
 * `loweredSchema` — THROWS with the diagnostics rendered. A refused parse must
 * never read as a pass.
 */
function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0035.theta");
  expect(
    diagLines(doc),
    `${label}: an inline object type is legal theta in every type position (grammar.md:109, type-system.md:15), so this fixture must load with NO diagnostics`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const properties = lowered["properties"];
  if (properties === undefined || typeof properties !== "object" || properties === null) {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  return {
    doc,
    properties: properties as Record<string, unknown>,
    required: (lowered["required"] ?? []) as readonly string[],
    defs: (lowered["$defs"] ?? {}) as Record<string, unknown>,
    fields: params.fields,
    loweredSchema: lowered,
  };
}

/**
 * The reject contract for the `params:` position: EXACTLY one diagnostic — the
 * registry's `theta/parse/unresolved-named-type` at error severity naming
 * `name` — and the theta does not load (`frontmatter === null`, the same
 * refusal fixture D already produces, because `parseParams` withholds the
 * lowered schema on any error and `parseFrontmatter` then refuses the block).
 */
function expectParamsRefused(doc: ThetaDocument, name: string, why: string): void {
  expect(
    diagLines(doc),
    `${why} — code-registry-parse.md:89 names the \`params:\` right-hand side as the FIRST of the row's four positions, and frontmatter-fields-a.md:58 states it directly; expected exactly one error naming '${name}'`,
  ).toEqual([unresolvedLine(name)]);
  expect(
    doc.frontmatter,
    `${why} — bug 0035 §Expected: "the theta does not load". An error-severity params diagnostic must collapse the frontmatter exactly as the plain-named typo (fixture D) does; a loaded theta whose param validates nothing is the hole this bug reports`,
  ).toBeNull();
}

/** The named field of a loaded params block, or a loud failure. */
function fieldOf(loaded: LoadedParams, wireName: string): BypassParamsField {
  const found = loaded.fields.find((f) => f.wireName === wireName);
  if (found === undefined) {
    throw new Error(
      `no params field '${wireName}' in ${JSON.stringify(loaded.fields)} — the declaration was dropped entirely`,
    );
  }
  return found;
}

/** A real `AjvSchemaValidator` plus the diagnostics it emitted. */
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

// ===========================================================================
// (0) THE ORACLE ITSELF — green now and after. `schemaSlug` is not imported, so
// these checks are what keeps the hand-written canonical forms honest.
// ===========================================================================

/** Compare two strings by Unicode code point, as the canonical key sort requires. */
function compareCodePoint(a: string, b: string): number {
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

/** Assert every object key in a parsed canonical form is code-point sorted. */
function assertKeysSorted(label: string, value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertKeysSorted(label, item, `${path}[${i}]`));
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  expect(
    keys,
    `${label}: §Canonical schema hash step 2 (:100) sorts object keys by Unicode code point; keys at ${path} are not sorted`,
  ).toEqual([...keys].sort(compareCodePoint));
  for (const key of keys) {
    assertKeysSorted(label, (value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

describe("bug 0035 (0) — the independent slug oracle", () => {
  const cases: ReadonlyArray<readonly [string, string, unknown]> = [
    ["fixture B `{a: Triage, b: integer}`", B_CANONICAL, B_FRAGMENT],
    ["fixture C `{a: integer}`", C_CANONICAL, C_FRAGMENT],
    ["MIXED inner `{c: integer}`", MIXED_INNER_CANONICAL, MIXED_INNER_FRAGMENT],
    ["MIXED outer `{a: Triage, b: {c: integer}}`", MIXED_OUTER_CANONICAL, MIXED_OUTER_FRAGMENT],
    ["NESTED-MULTI inner `{x: integer, y: string}`", NESTED_INNER_CANONICAL, NESTED_INNER_FRAGMENT],
    [
      "NESTED-MULTI outer `{a: Triage, b: {x: integer, y: string}}`",
      NESTED_OUTER_CANONICAL,
      NESTED_OUTER_FRAGMENT,
    ],
  ];

  for (const [label, canonical, fragment] of cases) {
    it(`ORACLE: the hand-written canonical form for ${label} is faithful, whitespace-free and key-sorted`, () => {
      // Parse-back equality: the hand-written bytes must denote exactly the
      // fragment they claim to, so a typo cannot silently shift the slug.
      expect(
        JSON.parse(canonical),
        `${label}: the hand-written canonical form must parse back to the lowered fragment it hashes`,
      ).toEqual(fragment);
      expect(
        canonical,
        `${label}: §Canonical schema hash step 2 (:101) forbids insignificant whitespace (no key or value here contains a space, so any whitespace is insignificant)`,
      ).not.toMatch(/\s/);
      assertKeysSorted(label, JSON.parse(canonical));
    });
  }

  it("ORACLE: the derived slug is 16 lowercase hex characters and the def name is `__inline_<slug>`", () => {
    for (const [label, canonical] of cases) {
      const slug = slugOfCanonicalForm(canonical);
      expect(
        slug,
        `${label}: §Canonical schema hash step 4 (:107) — the first 16 hex characters of the SHA-256 digest, lowercased`,
      ).toMatch(/^[0-9a-f]{16}$/);
      expect(
        inlineDefName(canonical),
        `${label}: step 2 (:73) and §Synthesised names (:108) — the hoisted key is \`__inline_<slug>\``,
      ).toBe(`__inline_${slug}`);
    }
    // The fragments are pairwise distinct, so their slugs must be too —
    // otherwise the dedup claim in group (b) would be vacuous.
    const slugs = cases.map(([, canonical]) => slugOfCanonicalForm(canonical));
    expect(
      new Set(slugs).size,
      "every distinct fragment must produce a distinct slug",
    ).toBe(cases.length);
  });
});

// ===========================================================================
// (a) THE DIAGNOSTIC — the fourth position of a closed DIAG-2 row.
// RED at HEAD: A and F produce ZERO diagnostics (probed), while G and H fire on
// byte-identical type text.
// ===========================================================================

describe("bug 0035 (a) — a name inside an inline object on the `params:` RHS raises unresolved-named-type", () => {
  it("RED (a1, fixture A): unquoted `p: {a: Tirage, b: integer}` fires exactly one unresolved-named-type naming 'Tirage'", () => {
    // The defect. YAML parses the RHS as a flow mapping, `extractParsedParams`
    // substitutes `""`, and nothing is left to resolve — so the typo is silent
    // and the param accepts any JSON value at the argument boundary.
    const doc = parseDoc(src("  p: {a: Tirage, b: integer}"), "bug0035.theta");
    expectParamsRefused(doc, "Tirage", "fixture A — the bug doc's §Reproduction fixture");
  });

  it("RED (a2, fixture F): the QUOTED `p: \"{a: Tirage, b: integer}\"` fires the same single diagnostic", () => {
    // The second route, isolated: quoting makes the RHS a YAML scalar, so the
    // brace text reaches `lowerTypeExpr` intact (fixture F's recorded
    // `field.type` proves it) and still lowers to `{}` with no diagnostic.
    // Fixing only the frontmatter read would leave this arm open, which is why
    // it is pinned separately from a1.
    const doc = parseDoc(src('  p: "{a: Tirage, b: integer}"'), "bug0035.theta");
    expectParamsRefused(doc, "Tirage", "fixture F — the quoted route into `lowerTypeExpr`");
  });

  it("RED (a3): all four positions of the row render the same bytes for the same text — A ≡ D ≡ G ≡ H", () => {
    // type-system.md:15 promises one type grammar in every annotation position.
    // The parity claim is what an author relies on when moving a type
    // expression between positions; today only three of the four honour it.
    const expected = [unresolvedLine("Tirage")];
    const plainNamed = parseDoc(src("  p: Tirage"), "bug0035.theta");
    const annotation = parseDoc(
      src("  q: string", "schema Triage { urgent: boolean }\nlet r = @<{a: Tirage, b: integer}>`hi`\n"),
      "bug0035.theta",
    );
    const schemaBody = parseDoc(
      src(
        "  q: string",
        "schema Triage { urgent: boolean }\nschema S { p: {a: Tirage, b: integer} }\nlet x = 1\n",
      ),
      "bug0035.theta",
    );
    // The three positions that already emit — asserted first, so a red here
    // names a broken control rather than the defect.
    expect(diagLines(plainNamed), "CONTROL D: the plain-named `params:` typo").toEqual(expected);
    expect(diagLines(annotation), "CONTROL G: the `@<T>` annotation position").toEqual(expected);
    expect(diagLines(schemaBody), "CONTROL H: the `schema` body field position").toEqual(expected);
    const inlineParams = parseDoc(src("  p: {a: Tirage, b: integer}"), "bug0035.theta");
    expect(
      diagLines(inlineParams),
      "fixture A must match its three siblings byte for byte (bug 0035 §Expected: \"matching fixtures G and H byte for byte\")",
    ).toEqual(expected);
  });

  it("RED (a4, NESTED-TYPO): a typo one brace DEEPER raises the same single diagnostic", () => {
    // `Tirage` sits inside the nested object of `p: {a: Triage, b: {x: Tirage,
    // y: string}}`. Splitting the OUTER field list on angle depth alone cuts
    // `b: {x: Tirage, y: string}` into `b: {x: Tirage` and `y: string}`; neither
    // fragment is identifier-shaped, so the name is never resolved and never
    // reported. Brace-depth nesting in the interior split is what carries the
    // name down to the resolution.
    //
    // The `params:` position raises here; its three siblings stay SILENT on this
    // same text, because their shared `lowerInlineObject`
    // (body-type-lowering.ts) splits an interior field list on angle depth alone
    // and drops the same two fragments on the floor. That asymmetry is
    // pre-existing, out of scope for bug 0035, and recorded as a residual — the
    // raise-parity this file pins (a3) is on the SINGLE-LEVEL text, where all
    // four positions agree.
    const doc = parseDoc(src("  p: {a: Triage, b: {x: Tirage, y: string}}"), "bug0035.theta");
    expectParamsRefused(doc, "Tirage", "NESTED-TYPO — a name one brace deeper than fixture A's");
  });
});

// ===========================================================================
// (b) THE LOWERING — step 2 hoist + step 3 `$ref`.
// RED at HEAD: every fixture here loads clean and lowers `properties.p = {}`
// (probed), so the red is the emission, never a parse rejection.
// ===========================================================================

describe("bug 0035 (b) — a well-formed inline object hoists to `$defs.__inline_<slug>` and emits a `$ref`", () => {
  it(`RED (b1, fixture B): \`p: {a: Triage, b: integer}\` emits $ref to ${B_INLINE} with the nested named ref resolved at the root`, () => {
    const loaded = loadCleanly("fixture B", src("  p: {a: Triage, b: integer}"));
    expect(
      loaded.properties["p"],
      `schema-subset.md:76 — an inline schema reference emits {"$ref":"#/$defs/<Name>"}; the hoisted name is ${B_INLINE}, the slug of the lowered fragment ${B_CANONICAL}`,
    ).toEqual({ $ref: `#/$defs/${B_INLINE}` });
    expect(
      loaded.defs[B_INLINE],
      `schema-subset.md:73 — the hoisted \`$defs\` entry is the lowered fragment itself (Object emission per step 3: properties in declaring order, every wire name required, additionalProperties false)`,
    ).toEqual(B_FRAGMENT);
    expect(
      loaded.defs["Triage"],
      "the fragment's `a` field refs `#/$defs/Triage`, a ROOT-absolute pointer, so `Triage` must be hoisted to the document root or AJV cannot resolve the document at all",
    ).toEqual(TRIAGE_DEF);
    expect(
      Object.keys(loaded.defs).sort(),
      "exactly two definitions: the hoisted inline fragment and the named schema it references",
    ).toEqual([B_INLINE, "Triage"].sort());
    expect(loaded.required, "a non-defaulted param is required").toEqual(["p"]);
  });

  it(`RED (b2, fixture C): the primitives-only \`p: {a: integer}\` hoists to ${C_INLINE}`, () => {
    // C bounds the defect away from resolution: there is no name to resolve at
    // all, and the declaration is still discarded.
    const loaded = loadCleanly("fixture C", src("  p: {a: integer}"));
    expect(
      loaded.properties["p"],
      `schema-subset.md:73/:76 — the anonymous object hoists under ${C_INLINE}, the slug of ${C_CANONICAL}`,
    ).toEqual({ $ref: `#/$defs/${C_INLINE}` });
    expect(loaded.defs[C_INLINE], "the hoisted fragment").toEqual(C_FRAGMENT);
    expect(
      Object.keys(loaded.defs),
      "only the hoisted fragment: `Triage` is declared in the body but referenced by no param, so it is not hoisted",
    ).toEqual([C_INLINE]);
  });

  it("RED (b3, fixture F′): the QUOTED well-formed RHS converges on the identical `$ref` and `$defs` entry", () => {
    // Both frames must close on the same emission: the quoted form already
    // reaches `lowerTypeExpr`, so this fixture reds on the missing
    // inline-object arm alone, independent of the frontmatter read.
    const loaded = loadCleanly("fixture F′ (quoted, well formed)", src('  p: "{a: Triage, b: integer}"'));
    expect(
      loaded.properties["p"],
      "the quoted and unquoted spellings of one type expression must lower identically — the quote is YAML syntax, not theta type syntax",
    ).toEqual({ $ref: `#/$defs/${B_INLINE}` });
    expect(loaded.defs[B_INLINE], "the same hoisted fragment fixture B produces").toEqual(B_FRAGMENT);
  });

  it(`RED (b4, DEDUP): two fields with byte-identical inline types share ONE ${C_INLINE} entry`, () => {
    // schema-subset.md:73 — "Two inline schemas resolve to one `$defs` entry
    // only when their lowered JSON Schema fragments are byte-identical". These
    // two are, so the table carries exactly one entry and both properties point
    // at it.
    const loaded = loadCleanly("DEDUP", src("  p: {a: integer}\n  q: {a: integer}"));
    expect(loaded.properties["p"], "field `p` refs the shared hoisted fragment").toEqual({
      $ref: `#/$defs/${C_INLINE}`,
    });
    expect(
      loaded.properties["q"],
      "field `q` declares byte-identical text, so it must ref the SAME def — not a second copy under a second slug",
    ).toEqual({ $ref: `#/$defs/${C_INLINE}` });
    expect(
      Object.keys(loaded.defs),
      "content addressing collapses the two declarations to one entry, and nothing else is hoisted",
    ).toEqual([C_INLINE]);
    expect(loaded.defs[C_INLINE], "the shared fragment").toEqual(C_FRAGMENT);
  });

  it("RED (b5, MIXED): a nested inline object inside an inline object hoists its own def", () => {
    // grammar.md:109 — "The `Type` reference inside each field is recursive, so
    // nested inline objects … parse", and step 2 hoists an inline object in ANY
    // type position, which includes a field position inside another inline
    // object. So `b` gets its own `__inline_` entry and the outer fragment refs
    // it; the outer slug is therefore a function of the inner slug.
    //
    // The nesting is total AT THIS POSITION, at any field count (b7): the
    // interior field list splits on brace depth, so a nested object is one
    // field's type. No parity with the sibling positions is claimed for the
    // nested case — theirs splits on angle depth alone; a3's parity claim is on
    // the single-level text.
    const loaded = loadCleanly("MIXED", src("  p: {a: Triage, b: {c: integer}}"));
    const outerRef = loaded.properties["p"];
    expect(
      outerRef,
      `the outer anonymous object hoists under ${MIXED_OUTER_INLINE}, the slug of ${MIXED_OUTER_CANONICAL}`,
    ).toEqual({ $ref: `#/$defs/${MIXED_OUTER_INLINE}` });
    expect(
      loaded.defs[MIXED_OUTER_INLINE],
      "the outer fragment: `a` refs the named schema, `b` refs the hoisted inner fragment (both root-absolute)",
    ).toEqual(MIXED_OUTER_FRAGMENT);
    expect(
      loaded.defs[MIXED_INNER_INLINE],
      `the nested \`{c: integer}\` is its own hoisted entry ${MIXED_INNER_INLINE}`,
    ).toEqual(MIXED_INNER_FRAGMENT);
    expect(
      Object.keys(loaded.defs).sort(),
      "three definitions: outer inline, inner inline, and the named schema the outer references",
    ).toEqual([MIXED_OUTER_INLINE, MIXED_INNER_INLINE, "Triage"].sort());
  });

  it("RED (b7, NESTED-MULTI): a nested inline object of TWO fields mints no phantom field or required key", () => {
    // The interior of a brace-rooted `params:` field is an inline-object FIELD
    // LIST, and grammar.md:109 makes each field's `Type` recursive — so a nested
    // `ObjectType` is ONE field's type and the comma inside it is not an outer
    // separator. Under an angle-only interior split the list reads as THREE
    // entries (`a: Triage`, `b: {x: integer`, `y: string}`), minting a permissive
    // `b`, a phantom top-level `y`, and a `required` of three names — all from
    // text that declares two fields.
    const loaded = loadCleanly(
      "NESTED-MULTI",
      src("  p: {a: Triage, b: {x: integer, y: string}}"),
    );
    expect(
      loaded.properties["p"],
      `schema-subset.md:76 — the outer anonymous object hoists under ${NESTED_OUTER_INLINE}, the slug of ${NESTED_OUTER_CANONICAL}`,
    ).toEqual({ $ref: `#/$defs/${NESTED_OUTER_INLINE}` });
    expect(
      loaded.defs[NESTED_OUTER_INLINE],
      "the outer fragment carries exactly `a` and `b`: `a` refs the named schema, `b` refs the hoisted TWO-field inner fragment",
    ).toEqual(NESTED_OUTER_FRAGMENT);
    expect(
      loaded.defs[NESTED_INNER_INLINE],
      `the nested \`{x: integer, y: string}\` is its own hoisted entry ${NESTED_INNER_INLINE}, with BOTH of its fields — not a truncated \`{x: integer\` fragment`,
    ).toEqual(NESTED_INNER_FRAGMENT);
    expect(
      (loaded.defs[NESTED_OUTER_INLINE] as Record<string, unknown>)["required"],
      "exactly the two field names declared at this level; a third entry here is the nested field list leaking into the outer one",
    ).toEqual(["a", "b"]);
    expect(
      Object.keys(loaded.defs).sort(),
      "three definitions: outer inline, inner inline, and the named schema the outer references",
    ).toEqual([NESTED_OUTER_INLINE, NESTED_INNER_INLINE, "Triage"].sort());
  });

  it("RED (b6, BESIDE): an inline field beside a plain primitive field leaves the primitive byte-unchanged", () => {
    // The mixed-block control: the fix must add an arm, not rewrite the
    // existing emissions or the `required` order.
    const loaded = loadCleanly("BESIDE", src("  n: integer\n  p: {a: integer}"));
    expect(
      loaded.properties["n"],
      "CONTROL: a primitive param keeps its step-3 primitive emission",
    ).toEqual({ type: "integer" });
    expect(loaded.properties["p"], "the inline field beside it hoists").toEqual({
      $ref: `#/$defs/${C_INLINE}`,
    });
    expect(loaded.required, "CONTROL: declaration order is preserved in `required`").toEqual([
      "n",
      "p",
    ]);
  });
});

// ===========================================================================
// (c) THE RECORDED SURFACE TYPE — `BypassParamsField.type` is "The field's
// declared surface type" (src/binder/binder-envelope.ts:166–185). A blank one
// renders the binder system prompt's per-field line as `  p () required`.
// RED at HEAD: every unquoted inline fixture records "" (probed).
// ===========================================================================

describe("bug 0035 (c) — `BypassParamsField.type` carries the author's bytes", () => {
  it("RED (c1, fixture B): the recorded type is the braces text as written", () => {
    const loaded = loadCleanly("fixture B", src("  p: {a: Triage, b: integer}"));
    expect(
      fieldOf(loaded, "p").type,
      'the recovered text is the AUTHOR\'s bytes, not a YAML round-trip: the type side is theta\'s grammar, not YAML\'s (bug 0035 §Actual behaviour frame 1). At HEAD this is "" and the binder prompt renders `  p () required`',
    ).toBe("{a: Triage, b: integer}");
  });

  it("RED (c2, fixture C): the primitives-only inline type is recorded verbatim", () => {
    const loaded = loadCleanly("fixture C", src("  p: {a: integer}"));
    expect(fieldOf(loaded, "p").type, 'at HEAD this is ""').toBe("{a: integer}");
  });

  it("CONTROL (c3, fixture F′): the quoted route already records the braces text — this is the target string shape", () => {
    // Green now and after. It is what makes c1/c2 honest: the quoted spelling
    // already proves what "the author's bytes" means on this field, so the
    // unquoted expectation is not invented.
    const loaded = loadCleanly("fixture F′ (quoted, well formed)", src('  p: "{a: Triage, b: integer}"'));
    expect(
      fieldOf(loaded, "p").type,
      "the quoted RHS is a YAML scalar, so the text already survives; the unquoted spelling must record the same bytes",
    ).toBe("{a: Triage, b: integer}");
  });

  it("CONTROL (c4): the recovered text does not disturb the derived flags", () => {
    const loaded = loadCleanly("fixture B", src("  p: {a: Triage, b: integer}"));
    const field = fieldOf(loaded, "p");
    expect(field.hasDefault, "no `= <literal>` was written").toBe(false);
    expect(field.nullable, "no top-level `| null` arm").toBe(false);
    expect(field.wireName, "the key is the wire name").toBe("p");
  });
});

// ===========================================================================
// (d) THE EMPTY INLINE OBJECT — bug 0035 §Expected: "`p: array<{}>` and an
// empty `p: {}` keep their current dispositions". The lowering claim is
// therefore GREEN-by-construction and the recovered-text claim is RED.
// ===========================================================================

describe("bug 0035 (d) — `p: {}` keeps its permissive disposition", () => {
  it("MIXED (d1, fixture I): no diagnostic and `properties.p = {}`, but the recovered text is `{}`", () => {
    const loaded = loadCleanly("fixture I", src("  p: {}"));
    // REQUIRED disposition (green now, must stay green): this bug does not
    // widen the empty case. grammar.md:109 assigns the empty inline object its
    // own diagnostic (`theta/parse/empty-schema-body`), which bug 0035
    // §Expected explicitly leaves out of scope — an implementer who ALSO closes
    // that case must update this row deliberately, in lock-step with a spec
    // decision, not silently.
    expect(
      loaded.properties["p"],
      "bug 0035 §Expected: the empty inline object keeps its current permissive `{}` — NOT hoisted, NOT additionalProperties:false",
    ).toEqual({});
    expect(
      Object.keys(loaded.defs),
      "nothing is hoisted for the empty case",
    ).toEqual([]);
    // RED observable: the frontmatter read must recover the bytes here too, so
    // the binder prompt renders `  p ({}) required` rather than `  p () required`.
    expect(
      fieldOf(loaded, "p").type,
      'the recovered surface text of `p: {}` is the two bytes the author wrote. At HEAD this is "" (the non-scalar discard applies to the empty flow mapping as well)',
    ).toBe("{}");
  });
});

// ===========================================================================
// (e) CONTROLS — green now, green after. These bound the fix: the plain-named
// pair, the two sibling positions, the generic scope bound, and the
// fail-closed unquoted generic form 0028 §Residuals (iv) records.
// ===========================================================================

describe("bug 0035 (e) — controls the fix must leave byte-unchanged", () => {
  it("CONTROL (e1, fixture D): the plain-named typo `p: Tirage` still refuses the theta", () => {
    const doc = parseDoc(src("  p: Tirage"), "bug0035.theta");
    expectParamsRefused(doc, "Tirage", "CONTROL D — the plain-named `params:` typo");
  });

  it("CONTROL (e2, fixture E): the plain-named `p: Triage` still lowers to its `$ref`", () => {
    const loaded = loadCleanly("fixture E", src("  p: Triage"));
    expect(loaded.properties["p"], "step 3 — a named schema reference").toEqual({
      $ref: "#/$defs/Triage",
    });
    expect(loaded.defs["Triage"], "the named schema's closed lowering").toEqual(TRIAGE_DEF);
    expect(Object.keys(loaded.defs), "only the referenced name is hoisted").toEqual(["Triage"]);
    expect(fieldOf(loaded, "p").type, "the recorded surface type of a named RHS").toBe("Triage");
  });

  it("CONTROL (e3, fixture G): the `@<T>` annotation position keeps its single diagnostic and its clean params block", () => {
    // The sibling position is unchanged: the diagnostic comes from the body, so
    // the frontmatter still parses (unlike the params-position refusal) and the
    // untouched `q: string` param still lowers.
    const doc = parseDoc(
      src("  q: string", "schema Triage { urgent: boolean }\nlet r = @<{a: Tirage, b: integer}>`hi`\n"),
      "bug0035.theta",
    );
    expect(diagLines(doc), "bug 0028's annotation-position emission").toEqual([
      unresolvedLine("Tirage"),
    ]);
    expect(
      doc.frontmatter?.params?.loweredSchema?.["properties"],
      "the params block in this fixture is clean and must be unaffected by a body-position diagnostic",
    ).toEqual({ q: { type: "string" } });
  });

  it("CONTROL (e4, fixture H): the `schema` body field position keeps its single diagnostic", () => {
    const doc = parseDoc(
      src(
        "  q: string",
        "schema Triage { urgent: boolean }\nschema S { p: {a: Tirage, b: integer} }\nlet x = 1\n",
      ),
      "bug0035.theta",
    );
    expect(diagLines(doc), "bug 0028's schema-body-position emission").toEqual([
      unresolvedLine("Tirage"),
    ]);
  });

  it("SCOPE BOUND (e5, ARRAY): an inline object under a generic stays clean and either permissive or hoisted — nothing else", () => {
    // Bug 0035's scope is the params-position ROOT. The generic arm recurses
    // through the same `lowerTypeExpr`, so an inline-object arm added there
    // MAY legitimately widen `array<{a: integer}>` from today's `items: {}` to
    // the hoisted `$ref` (schema-subset.md:73 — "any type position"). Both
    // readings are admitted here; anything else — a diagnostic, a dropped root,
    // an un-hoisted nested object literal — fails. An implementer who widens
    // this deliberately keeps this test green; one who breaks the generic arm
    // reds immediately.
    const loaded = loadCleanly("ARRAY (quoted `array<{a: integer}>`)", src('  p: "array<{a: integer}>"'));
    const p = loaded.properties["p"] as Record<string, unknown>;
    expect(Object.keys(p).sort(), "step 3 — the `array<T>` emission carries exactly `type` and `items`").toEqual(
      ["items", "type"],
    );
    expect(p["type"], "the root stays an array emission").toBe("array");
    const items = p["items"];
    const permissive = JSON.stringify(items) === "{}";
    const hoisted =
      typeof items === "object" &&
      items !== null &&
      JSON.stringify(items) === JSON.stringify({ $ref: `#/$defs/${C_INLINE}` });
    expect(
      permissive || hoisted,
      `the element type must be either today's permissive {} or the hoisted {"$ref":"#/$defs/${C_INLINE}"}; observed ${JSON.stringify(items)}`,
    ).toBe(true);
    if (hoisted) {
      // Not a skip: the disjunction above is already asserted. This adds the
      // stronger claim on the widened branch — a minted ref must have a
      // fragment, or AJV cannot resolve the document.
      expect(
        loaded.defs[C_INLINE],
        "a widened generic arm must hoist the fragment it refs, byte-identical to fixture C's",
      ).toEqual(C_FRAGMENT);
    }
  });

  it("SCOPE BOUND (e8, ARRAY-MULTI): a TWO-field inline object under a generic stays permissive at the ROOT, with no diagnostic", () => {
    // The companion bound to e5, and the reason bug 0035's interior-split fix is
    // scoped to the brace-rooted `params:` FIELD LIST: `lowerTypeExpr`'s GENERIC
    // ARGUMENT split keeps its `"angle"` nesting. theta-document.ts's
    // `unresolvedNamedTypeDiagnostic` records why — under brace tracking this
    // text presents as ONE argument and lowers to `{"type":"array","items":{}}`,
    // a fragment asserting arrayness while dropping the element shape the author
    // wrote. Under angle depth alone it is TWO arguments, the `array` arm does
    // not match, and the whole form lowers to `{}`, which asserts nothing.
    // Giving the generic path brace tracking would red this control.
    const loaded = loadCleanly(
      "ARRAY-MULTI (quoted `array<{x: integer, y: string}>`)",
      src('  p: "array<{x: integer, y: string}>"'),
    );
    expect(
      loaded.properties["p"],
      "the arity mismatch takes the permissive generic arm: nothing about the shape was derived, so nothing is asserted — NOT an `array` emission with a dropped element type",
    ).toEqual({});
    expect(
      Object.keys(loaded.defs),
      "nothing is hoisted: neither split fragment is identifier-shaped, so no named type resolves",
    ).toEqual([]);
  });

  it("SCOPE BOUND (e6, `p: array<{}>`): the empty inline object under a generic keeps its current disposition", () => {
    // Named by bug 0035 §Expected verbatim.
    const loaded = loadCleanly("`p: array<{}>`", src("  p: array<{}>"));
    expect(loaded.properties["p"], "unchanged: an array of a permissive element schema").toEqual({
      type: "array",
      items: {},
    });
  });

  it("SCOPE BOUND (e7): the UNQUOTED `p: array<{a: string}>` stays fail-closed on the YAML frame (0028 §Residuals (iv))", () => {
    // A distinct open shape: braces inside a generic's angle brackets break the
    // YAML parse outright (`BLOCK_AS_IMPLICIT_KEY`), FM-5 collapses the
    // frontmatter, and the load fails closed on `theta/load/missing-mode`. Bug
    // 0035 recovers the value of a WELL-FORMED YAML node; it does not make an
    // unparseable frontmatter document parse.
    const doc = parseDoc(src("  p: array<{a: string}>"), "bug0035.theta");
    expect(
      diagLines(doc),
      "fail-closed, not silent: the whole frontmatter collapses and the theta does not load",
    ).toEqual([
      "error theta/load/missing-mode: frontmatter is missing required field 'mode:'",
    ]);
    expect(doc.frontmatter, "FM-5 collapse").toBeNull();
  });
});

// ===========================================================================
// (f) THE ARGUMENT BOUNDARY — the consequence bug 0035 §Why it matters names:
// "`{}` means the AJV envelope check for that field accepts anything". Driven
// through the real `AjvSchemaValidator` (the V8c seam) over the lowered
// document the load produced.
// RED at HEAD: `{p: 7}` VALIDATES against `properties.p = {}` (probed).
// ===========================================================================

describe("bug 0035 (f) — the lowered params document actually constrains the argument", () => {
  it("RED (f1, fixture B): a non-object argument is REJECTED, and a well-formed one is accepted", () => {
    const loaded = loadCleanly("fixture B", src("  p: {a: Triage, b: integer}"));
    const { validator, emitted } = ajv();
    const compiled = validator.compile(loaded.loweredSchema);
    // The accept-anything hole, asserted first so the red names it.
    expect(
      compiled.validate({ p: 7 }).ok,
      "bug 0035 §Why it matters: with `properties.p = {}` the envelope check accepts any JSON value for a param declared as an object — the same accept-anything hole bug 0028 closed at the response boundary",
    ).toBe(false);
    expect(
      compiled.validate({ p: { a: { urgent: true }, b: 1 } }).ok,
      "the well-formed argument must still validate — the hoisted `$ref` and the root `$defs` have to be AJV-resolvable, or the fix trades a silent hole for a broken envelope",
    ).toBe(true);
    expect(
      compiled.validate({ p: { a: { urgent: "yes" }, b: 1 } }).ok,
      "the nested named schema's field type is enforced through the `$ref` chain",
    ).toBe(false);
    expect(
      compiled.validate({ p: { a: { urgent: true } } }).ok,
      "every wire name of an inline object is required (step 3's Object emission)",
    ).toBe(false);
    expect(
      compiled.validate({ p: { a: { urgent: true }, b: 1, extra: 1 } }).ok,
      "`additionalProperties: false` on the hoisted fragment",
    ).toBe(false);
    expect(
      emitted.map((d) => d.code),
      "no slug-collision diagnostic: one compile of one document",
    ).toEqual([]);
  });

  it("RED (f2, NESTED-MULTI): the author's own payload validates and the phantom shape does not", () => {
    const loaded = loadCleanly(
      "NESTED-MULTI",
      src("  p: {a: Triage, b: {x: integer, y: string}}"),
    );
    const { validator, emitted } = ajv();
    const compiled = validator.compile(loaded.loweredSchema);
    expect(
      compiled.validate({ p: { a: { urgent: true }, b: { x: 1, y: "s" } } }).ok,
      "the payload the author's own declaration describes must validate. Under an angle-only interior split the minted fragment requires a TOP-LEVEL `y` that declaration never mentions, so the author's own payload is rejected by their own params schema",
    ).toBe(true);
    expect(
      compiled.validate({ p: { a: { urgent: true }, b: "anything", y: 42 } }).ok,
      "the phantom shape — an unconstrained `b` beside a top-level `y` — is exactly what the angle-only split's fragment accepts, and it is not the declared type",
    ).toBe(false);
    expect(
      compiled.validate({ p: { a: { urgent: true }, b: { x: 1 } } }).ok,
      "every wire name of the nested fragment is required, `y` included (step 3's Object emission)",
    ).toBe(false);
    expect(
      compiled.validate({ p: { a: { urgent: true }, b: { x: 1, y: "s", z: 0 } } }).ok,
      "`additionalProperties: false` on the nested hoisted fragment",
    ).toBe(false);
    expect(
      emitted.map((d) => d.code),
      "no slug-collision diagnostic: two distinct fragments, two distinct slugs",
    ).toEqual([]);
  });
});

// ===========================================================================
// (g) THE `__inline_<slug>` BYTE-EQUALITY CHECK — schema-subset.md:73 mandates
// it "on every `__inline_<slug>` slug match", and §Schema-slug collision posture
// (:112) fixes the mechanics: a slug-keyed dedup table stores the canonical-form
// bytes alongside the keyed artefact, compares them on a slug match BEFORE
// treating the two fragments as the same, and on a byte mismatch surfaces a
// diagnostic and refuses to dedup rather than silently aliasing two distinct
// fragments. `theta/load/schema-slug-collision` is that site's registered code
// (code-registry-load.md:58) and the row's posture is "The file is not
// registered", which an error-severity `params:` diagnostic delivers by
// withholding the lowered schema.
//
// A REAL collision needs ~2^32 hash work, so the CHECK is pinned at the unit
// level instead: `lowerParamsFieldType` is exported, so it is driven with a
// hand-built `LowerCtx` whose `defs` / `inlineCanonical` are pre-seeded exactly
// as a collision would leave them. The per-block diagnostic `parseParams` pushes
// off the recorded sink is therefore covered by g1's sink pin plus g4's registry
// oracle and a code read of `parseParams` — not by a constructed collision,
// which no test can build. Nothing here is skipped: every claim below is
// asserted.
// ===========================================================================

describe("bug 0035 (g) — a `__inline_<slug>` slug match is settled by byte comparison", () => {
  /** The slug fixture C's fragment hashes to, per the independent oracle. */
  const SLUG = slugOfCanonicalForm(C_CANONICAL);
  const DEF_NAME = `__inline_${SLUG}`;

  /** A fragment that is NOT fixture C's — the stand-in colliding entry. */
  const FOREIGN_FRAGMENT = {
    type: "object",
    properties: { zzz: { type: "string" } },
    required: ["zzz"],
    additionalProperties: false,
  };

  /** A `LowerCtx` with no body types, an empty table, and both new sinks live. */
  function ctxWith(
    defs: Record<string, Record<string, unknown>>,
    inlineCanonical: Map<string, string>,
    slugCollisions: string[],
  ): LowerCtx {
    return {
      bodyTypeMap: new Map<string, Record<string, unknown>>(),
      defs,
      unresolved: [],
      inlineCanonical,
      slugCollisions,
    };
  }

  it("g1: a slug hit whose STORED BYTES DIFFER retains the earlier fragment and records the slug", () => {
    // The seeded state is what a genuine 64-bit collision leaves behind: the
    // table already holds an entry under this slug, and the bytes stored beside
    // it are not the ones the fragment now being minted serialises to.
    const defs: Record<string, Record<string, unknown>> = { [DEF_NAME]: { ...FOREIGN_FRAGMENT } };
    const collisions: string[] = [];
    const ctx = ctxWith(defs, new Map([[SLUG, '{"different":"bytes"}']]), collisions);

    const emitted = lowerParamsFieldType("{a: integer}", ctx);

    expect(
      defs[DEF_NAME],
      "first wins: the posture (:112) refuses to dedup on a byte mismatch, so the EARLIER fragment survives — the retention `dedupInlineSchemas` (schema-lowering.ts) already applies. An unchecked overwrite would leave the earlier field's `$ref` pointing at a fragment it never declared",
    ).toEqual(FOREIGN_FRAGMENT);
    expect(
      collisions,
      "the 16-hex slug is recorded in the sink, which is what `parseParams` turns into the registered `theta/load/schema-slug-collision` error — an error severity withholds the lowered schema, so the file is not registered (code-registry-load.md:58)",
    ).toEqual([SLUG]);
    expect(
      emitted,
      "the emission still names the slug-keyed entry; the refusal is carried by the diagnostic, not by a mangled `$ref`",
    ).toEqual({ $ref: `#/$defs/${DEF_NAME}` });
    expect(ctx.unresolved, "no named type is involved in this fixture").toEqual([]);
  });

  it("g2: a slug hit whose stored bytes are EQUAL dedups silently — no collision recorded", () => {
    // The DEDUP path (b4) through the same branch: schema-subset.md:73 collapses
    // byte-identical fragments to one entry, and that collapse must stay silent.
    const defs: Record<string, Record<string, unknown>> = { [DEF_NAME]: { ...C_FRAGMENT } };
    const collisions: string[] = [];
    const ctx = ctxWith(defs, new Map([[SLUG, C_CANONICAL]]), collisions);

    expect(lowerParamsFieldType("{a: integer}", ctx)).toEqual({ $ref: `#/$defs/${DEF_NAME}` });
    expect(defs[DEF_NAME], "the retained entry is unchanged").toEqual(C_FRAGMENT);
    expect(
      collisions,
      "byte-identical canonical forms are the dedup case, not a collision; a diagnostic here would refuse legal theta (b4 is exactly this text twice)",
    ).toEqual([]);
  });

  it("g3: a FIRST mint stores the canonical-form bytes beside the entry, so a later match can be byte-compared", () => {
    const defs: Record<string, Record<string, unknown>> = {};
    const inlineCanonical = new Map<string, string>();
    const collisions: string[] = [];

    expect(lowerParamsFieldType("{a: integer}", ctxWith(defs, inlineCanonical, collisions))).toEqual(
      { $ref: `#/$defs/${DEF_NAME}` },
    );
    expect(defs[DEF_NAME], "the minted fragment").toEqual(C_FRAGMENT);
    expect(
      inlineCanonical.get(SLUG),
      "posture (:112): the stored bytes are the CANONICAL form — code-point-sorted keys, no insignificant whitespace — so the check is a byte comparison and not a re-serialisation. Compared against the hand-written oracle string, never against the implementation's own serialiser",
    ).toBe(C_CANONICAL);
    expect(collisions, "a first mint is not a collision").toEqual([]);
  });

  it("g4: the registry row for the collision code carries the Message template the emission renders (DIAG-4)", () => {
    const template = registryMessage(REGISTRY, "theta/load/schema-slug-collision") as
      | string
      | undefined;
    expect(
      template,
      "docs/spec_topics/diagnostics/code-registry-load.md must carry the Message row for theta/load/schema-slug-collision",
    ).toBeDefined();
    expect(
      template,
      "the `params:` position renders this template with `<slug>` replaced by the colliding 16-hex slug, byte-identical to `dedupInlineSchemas`'s emission (schema-lowering.ts) — held identical by DIAG-4, not by shared code",
    ).toBe("schema-slug collision on slug <slug>: two distinct inline schemas hash alike");
  });
});
