import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildBodyTypeSchemas,
  lowerInlineObject,
  lowerTypeSource,
} from "../src/parser/body-type-lowering";
import type { EnumDecl, SchemaDecl } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  RESPOND_ENVELOPE_KEY,
  respondSchemaIsEnveloped,
  respondToolWireSchema,
} from "../src/runtime/respond-tool-wire";
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0055 — `docs/spec_topics/schema-subset.md:80` states ONE step-3 emission
// rule covering TWO source forms — "Enum (or string-literal union):
// `{ "type": "string", "enum": [...wire values...] }`" — and the implementation
// splits it across two functions
// (docs/bugs/0055-literal-union-lowering-omits-type-string-vs-subs1.md).
//
//   - `lowerEnumToSchema` (src/parser/body-type-lowering.ts:100) serves the
//     named `enum` declaration and emits the spelled bytes, `type` first.
//   - `lowerTypeSource`'s literal-union arm (`:378–392`, the union return at
//     `:383–385`) serves the anonymous string-literal union and emits
//     `{ enum: [...] }` — the same array, the `type` keyword absent.
//
// WHAT THE MISSING KEY COSTS. Both fragments admit and refuse the same JSON
// values, so the divergence is not a validation defect; the bytes are the
// defect, and the bytes are load-bearing at four sites: `respondSchemaSlug`
// (src/runtime/typed-query-validation.ts:347–348) hashes `JSON.stringify`, so it
// is sensitive to the presence AND the position of `type` and names the
// registered `__theta_respond_<slug>` tool; the `__inline_<slug>` mint hashes
// the key-sorted canonical form, so it moves too; the QRY-15 instruction
// interpolates the fragment, so the model is shown it; and the AJV issue list
// that drives QRY-11 respond-repair gains a leading `type` entry once `type` is
// present. The sharpest consequence is that
// `enum Sev { Low = "low", High = "high" }` and `schema Sev = "low" | "high"`
// mint two respond tools for one declared value set.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schema-subset.md:80 — the rule diverged from: an enum OR
//     a string-literal union emits `{ "type": "string", "enum": [...] }`.
//     Mirrored for the user-facing reference at
//     docs/reference/schema-subset.md:163–164.
//   - :79 — a SINGLE literal of any type emits `{ "const": <value> }`. The
//     single-literal arm (src/parser/body-type-lowering.ts:390) already spells
//     it, and group (d)'s d5 holds it still.
//   - :81 — SUBS-1 governs a union of `PrimitiveType` arms and emits
//     `{ "type": [...] }`. A string-literal union is `LiteralType` arms
//     (docs/spec_topics/grammar.md:102), so `:81` is NOT its rule; SUBS-3
//     (`:80`, anchor `#subs-3`) is; group (e)'s e4 pins the primitive-union arm as untouched by `:80`.
//   - :85 — *Array element order*: the `enum` array carries wire values in
//     source enumeration order, which the current arm already satisfies.
//   - :94–:108 — §Canonical schema hash: the `__inline_<slug>` recipe the
//     oracle below follows (code-point-sorted object keys, array elements in
//     lowering order, no insignificant whitespace, SHA-256, first 16 lowercase
//     hex characters), and the statement that the recipe "is part of the
//     on-disk and on-wire contract".
//   - docs/spec_topics/schemas.md:78 — §Enum declarations, the name-is-wire
//     default the `enum` array carries in both spellings.
//   - docs/spec_topics/query/query-tool-loop.md:37 — QRY-15 conveyance: the
//     lowered fragment is shown to the model, not only enforced.
//
// THE POSITIONS THE ARM REACHES, all through `lowerTypeSource`, and all pinned
// by group (a): the `@<T>` / `invoke<T>` annotation root's non-brace form
// (src/runtime/query-schema-lowering.ts:160) and its brace form (`:153`, which
// routes through `lowerInlineObject`
// (src/parser/body-type-lowering.ts:153), delegating to
// `lowerObjectFields`'s per-field call at `:120`), `buildBodyTypeSchemas`
// pass 2's
// `schema`-body call (`:577`) and its alias/union right-hand-side call
// (`:598`), and the `lowerField` inner helper (`:399`) that re-enters this
// function for each field of a hoisted inline object, so the arm fires at every
// nesting depth of every position above.
//
// PROBED CURRENT SIGNATURES (HEAD 6fdccf0b / 0.58.0, offline, deterministic;
// byte-identical to the bug doc's §Reproduction tables at 0.49.0 — zero drift):
//
//   direct  lowerTypeSource('"x" | "y"')         {"enum":["x","y"]}
//   ann     @<"x" | "y">                         {"enum":["x","y"]}
//   ann     @<{a: "x" | "y"}>                    properties.a = {"enum":["x","y"]}
//   ann     @<{a: {b: "x" | "y"}}>               hoists __inline_f58549a813c166f9
//   field   schema S { p: "x" | "y" }            properties.p = {"enum":["x","y"]}
//   alias   schema X = "x" | "y"                 {"enum":["x","y"]}
//   inline  lowerInlineObject('b: "x" | "y"')    properties.b = {"enum":["x","y"]}
//   enum Sev { Low = "low", High = "high" }      {"type":"string","enum":["low","high"]}
//                                                respondSchemaSlug 1aae0990d53b3485
//                                                (the slug of the canonical form
//                                                {"enum":["low","high"],"type":"string"};
//                                                bug 0099 route A is the authority)
//   schema Sev = "low" | "high"                  {"enum":["low","high"]}
//                                                respondSchemaSlug 3738bdf57eb9ee93
//                                                (unmoved: one key, so its canonical form
//                                                equals its emission)
//   AJV over both spellings                      identical verdict on 13 payloads;
//                                                a non-string payload's issue list is
//                                                one `enum` entry for the bare form and
//                                                `type` then `enum` for the spelled one
//   params  p: "x" | "y"                         {"anyOf":[{},{}]}
//   generic array<"x" | "y">                     {"type":"array","items":{"anyOf":[{},{}]}}
//                                                (bug 0164 §Fix moves this row to
//                                                {"type":"array","items":{"type":"string",
//                                                "enum":["x","y"]}}: the generic ARGUMENT
//                                                recursion consults the same sublanguage
//                                                this file's arm owns at the whole source)
//   mixed   "x" | string                         {"anyOf":[{},{"type":"string"}]}
//                                                (bug 0184 §Fix moves this row to
//                                                {"anyOf":[{"const":"x"},{"type":"string"}]}:
//                                                the literal ARM lowers under
//                                                schema-subset.md:79 once the union-arm
//                                                recursion consults the same sublanguage
//                                                this file's arm owns at the whole source)
//   SUBS-1  string | null                        {"type":["string","null"]}
//
// WHAT IS RED HERE: every cell of groups (a), (b) and (c)'s c2 — each observes
// the bare `{"enum":[...]}` where `:80` spells `{"type":"string","enum":[...]}` —
// plus group (e)'s e1, whose `params:` position bug 0056 §Fix constraint 1
// brings onto this same emission through one shared helper
// (docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md).
// Group (c)'s c1 (the 13-payload verdict table), group (d) (the all-strings
// guard in its REFUSING direction) and group (e)'s e2 / e3 / e4 (the generic
// argument and mixed union bug 0056 §Non-goals leaves permissive, plus the
// SUBS-1 control) are green now and must stay green
// byte-for-byte: they are what keeps the fix from over-reaching. TWO EXCEPTIONS,
// EACH LIFTED LATER BY ITS OWN REPORT, both keeping their subject and their
// one-position scope while their pinned bytes were re-derived: bug 0184 §Fix
// routes the union-ARM recursion through this same literal sublanguage, so
// `e3`'s mixed union `"x" | string` is re-derived onto
// `{"anyOf":[{"const":"x"},{"type":"string"}]}`; and bug 0164 §Fix (v0.123.0)
// routes the generic-ARGUMENT recursion through it, so `e2`'s
// `array<"x" | "y">` is re-derived onto
// `{"type":"array","items":{"type":"string","enum":["x","y"]}}`. In both cases
// the MECHANISM the old message described — a recursion that re-enters
// `lowerTypeExpr` and reaches no literal rule — is exactly what the later fix
// removed. `e4` (the SUBS-1 control) stays byte-frozen. `1 | 2`,
// `"x" | 1`, `true | false` and `"x" | null` keep the bare `enum` under SUBS-3
// (schema-subset.md:80, the anchor `#subs-3`), which governs a literal union
// not all of whose arms are strings; the string-typed form refuses non-strings.
//
// THE SLUG ORACLE IS INDEPENDENT. `schemaSlug` (src/parser/schema-lowering.ts)
// is deliberately NOT imported: an oracle taken from the implementation under
// test proves nothing. The one `__inline_<slug>` this file expects is derived
// from a HAND-WRITTEN canonical-form string following the §Canonical schema hash
// recipe, hashed with `node:crypto`, and group (0) keeps that string honest by
// parse-back equality against the fragment it claims to serialise plus a
// whitespace and key-sort check.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one lowering call — a direct `lowerTypeSource` / `lowerInlineObject` /
// `buildBodyTypeSchemas` / `lowerQueryResponseSchema`, or `parseThetaDocument`
// over a string — plus one real AJV compile of the fragment that call produced.
// Nothing crosses a session, a child process or a provider. An integration or
// live tier could not observe the subject at all: the claim is about the exact
// bytes at a lowering boundary and about the 16-hex slug hashed from them, both
// fully determined before any turn runs, and a provider round-trip would add
// stochastic surface over a contract that has none.
//
// NO SILENT SKIPPING: every fixture that must load asserts its diagnostic list
// and then fails LOUDLY — diagnostics rendered — if the frontmatter, the params
// block, a `$defs` entry or the lowered annotation is absent. A refused parse or
// an unlowerable annotation can never be mistaken for a pass.

// ===========================================================================
// The one emission `:80` spells, and the independent slug oracle.
// ===========================================================================

/** `"x" | "y"` under `:80`: the wire values enumerated, `type` written FIRST. */
const XY_ENUM = { type: "string", enum: ["x", "y"] };

/** `{b: "x" | "y"}` — the fragment the depth-1 annotation hoists. */
const B_XY_FRAGMENT = {
  type: "object",
  properties: { b: XY_ENUM },
  required: ["b"],
  additionalProperties: false,
};

/**
 * `B_XY_FRAGMENT`'s canonical form: the same value with object keys sorted by
 * Unicode code point at every level (`additionalProperties` < `properties` <
 * `required` < `type`, and `enum` < `type` inside `b`) and array elements left
 * in lowering order.
 */
const B_XY_CANONICAL =
  '{"additionalProperties":false,"properties":{"b":{"enum":["x","y"],"type":"string"}},' +
  '"required":["b"],"type":"object"}';

/** SHA-256 of the canonical-form bytes, first 16 lowercase hex characters (:106–:107). */
function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73). */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}

const B_XY_INLINE = inlineDefName(B_XY_CANONICAL);

// ===========================================================================
// Loud fixture drivers — every absent intermediate throws with the reason.
// ===========================================================================

/** An empty body-type map: the direct-call fixtures name no declared type. */
function noBodyTypes(): Map<string, Record<string, unknown>> {
  return new Map<string, Record<string, unknown>>();
}

/** One direct `lowerTypeSource` call, asserting the source resolves no names. */
function lowerSource(label: string, source: string): Record<string, unknown> {
  const unresolved: string[] = [];
  const lowered = lowerTypeSource(source, noBodyTypes(), {}, unresolved);
  expect(
    unresolved,
    `${label}: \`${source}\` names no declared type, so an unresolved-name entry here ` +
      `would mean the literal arm was never taken; observed ${JSON.stringify(unresolved)}`,
  ).toEqual([]);
  return lowered;
}

/** The `schema` / `enum` declarations of a body that MUST parse cleanly. */
function declsOf(
  label: string,
  body: string,
): { readonly schemas: SchemaDecl[]; readonly enums: EnumDecl[] } {
  const doc = parseDoc(`---\nmode: prompt\n---\n${body}\n`, "bug0055.theta");
  const lines = doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
  expect(
    lines,
    `${label}: the fixture body must load with NO diagnostics or the lowering under ` +
      `assertion never runs; observed ${JSON.stringify(lines)}`,
  ).toEqual([]);
  return {
    schemas: doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema"),
    enums: doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum"),
  };
}

/** One `@<T>` annotation lowered against a body, never `undefined`. */
function annotationRoot(label: string, annotation: string, body = ""): LoweredSchema {
  const { schemas, enums } = declsOf(label, body);
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  if (lowered === undefined) {
    throw new Error(
      `${label}: \`@<${annotation}>\` lowered to nothing, so QRY-22 would bind an ` +
        `UNVALIDATED response; only the EMPTY annotation may lower to undefined`,
    );
  }
  return lowered;
}

/** One `$defs` entry of a body's lowered type map, never absent. */
function bodyDef(label: string, body: string, name: string): Record<string, unknown> {
  const { schemas, enums } = declsOf(label, body);
  const def = buildBodyTypeSchemas(schemas, enums).get(name);
  if (def === undefined) {
    throw new Error(
      `${label}: \`${name}\` is declared in the fixture body, so \`buildBodyTypeSchemas\` ` +
        `must return a \`$defs\` entry for it; the map is empty at that key`,
    );
  }
  return def;
}

/** The lowered `params:` schema of a theta that MUST load, never absent. */
function paramsSchema(label: string, source: string): LoweredSchema {
  const doc = parseDoc(source, "bug0055-params.theta");
  const lines = doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
  expect(
    lines,
    `${label}: a literal union is legal theta in the \`params:\` position ` +
      `(type-system.md:15), so this fixture must load with NO diagnostics; observed ` +
      `${JSON.stringify(lines)}`,
  ).toEqual([]);
  const lowered = doc.frontmatter?.params?.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the theta declares a \`params:\` block, so its lowered schema must be ` +
        `present (BIND-1); frontmatter=${JSON.stringify(doc.frontmatter)}`,
    );
  }
  return lowered;
}

/** The real AJV seam — `strict: false`, `allErrors: true`, the QRY-22 validator. */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

// ===========================================================================
// (0) The slug oracle's own honesty — the hand-written canonical form must be
// the fragment it claims to serialise, in canonical form.
// ===========================================================================

describe("bug 0055 (0) — the independent `__inline_<slug>` oracle", () => {
  it("CONTROL (o1): the hand-written canonical form parses back to the fragment it names", () => {
    expect(
      JSON.parse(B_XY_CANONICAL),
      `schema-subset.md:98 hashes the LOWERED fragment, so the oracle's canonical string ` +
        `must carry exactly that value and no other; observed ${B_XY_CANONICAL}`,
    ).toEqual(B_XY_FRAGMENT);
  });

  it("CONTROL (o2): the canonical form sorts every object's keys and carries no insignificant whitespace", () => {
    expect(
      B_XY_CANONICAL,
      `schema-subset.md:101 — no space or newline between tokens; observed ${B_XY_CANONICAL}`,
    ).toBe(JSON.stringify(JSON.parse(B_XY_CANONICAL)));
    const sorted = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map(sorted);
      }
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => [k, sorted(v)]),
        );
      }
      return value;
    };
    expect(
      B_XY_CANONICAL,
      `schema-subset.md:100 — object keys sorted by Unicode code point at every level; ` +
        `schema-subset.md:104 — array elements left in lowering order; observed ${B_XY_CANONICAL}`,
    ).toBe(JSON.stringify(sorted(B_XY_FRAGMENT)));
  });
});

// ===========================================================================
// (a) ONE RULE, EVERY POSITION — the arm's emission at each `lowerTypeSource`
// position, all six agreeing on the bytes `:80` spells.
// RED at HEAD: every cell observes the bare `{"enum":["x","y"]}`.
// ===========================================================================

describe("bug 0055 (a) — a string-literal union emits `{type:string, enum:[…]}` at every position", () => {
  it("RED (a1, DIRECT): `lowerTypeSource('\"x\" | \"y\"')` emits the spelled fragment", () => {
    const lowered = lowerSource("a1", '"x" | "y"');
    expect(
      lowered,
      `schema-subset.md:80 gives ONE emission for an enum or a string-literal union — ` +
        `\`{"type":"string","enum":[...]}\` — and body-type-lowering.ts:383–385 is the arm ` +
        `that must produce it; observed ${JSON.stringify(lowered)}`,
    ).toEqual(XY_ENUM);
  });

  it("RED (a2, ANNOTATION ROOT): `@<\"x\" | \"y\">` lowers the spelled fragment as the document root", () => {
    const lowered = annotationRoot("a2", '"x" | "y"');
    expect(
      lowered,
      `schema-subset.md:80 — the annotation root's non-brace form ` +
        `(query-schema-lowering.ts:160) hands the source straight to the arm, so the ` +
        `response schema QRY-22 enforces and QRY-15 conveys is the spelled fragment; ` +
        `observed ${JSON.stringify(lowered)}`,
    ).toEqual(XY_ENUM);
  });

  it("RED (a3, ANNOTATION BRACE FORM): `@<{a: \"x\" | \"y\"}>` carries the spelled fragment at its field", () => {
    const lowered = annotationRoot("a3", '{a: "x" | "y"}');
    expect(
      lowered,
      `schema-subset.md:80 — the brace form (query-schema-lowering.ts:153) routes each ` +
        `field through \`lowerInlineObject\` (body-type-lowering.ts:153), which ` +
        `delegates to \`lowerObjectFields\`'s per-field call (:120) — the same arm; ` +
        `${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { a: XY_ENUM },
      required: ["a"],
      additionalProperties: false,
    });
  });

  it("RED (a4, DEPTH 1): `@<{a: {b: \"x\" | \"y\"}}>` hoists the spelled fragment under its own slug", () => {
    // The hoisted fragment's canonical form gains the `type` key, so the mint's
    // input changes and the `__inline_` name moves with it. The oracle derives
    // the new name from the canonical string above rather than pasting a slug.
    const lowered = annotationRoot("a4", '{a: {b: "x" | "y"}}');
    expect(
      lowered,
      `schema-subset.md:80 at depth — the \`lowerField\` helper ` +
        `(body-type-lowering.ts:399) re-enters \`lowerTypeSource\` per field, so a ` +
        `nested literal union emits the same bytes as a top-level one, and the ` +
        `\`__inline_<slug>\` mint (:94–:108) hashes them; observed ` +
        `${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { a: { $ref: `#/$defs/${B_XY_INLINE}` } },
      required: ["a"],
      additionalProperties: false,
      $defs: { [B_XY_INLINE]: B_XY_FRAGMENT },
    });
  });

  it("RED (a5, `schema` BODY FIELD): `schema S { p: \"x\" | \"y\" }` lowers the spelled fragment, and `@<S>` agrees byte for byte", () => {
    const body = 'schema S { p: "x" | "y" }';
    const expected = {
      type: "object",
      properties: { p: XY_ENUM },
      required: ["p"],
      additionalProperties: false,
    };
    const def = bodyDef("a5", body, "S");
    expect(
      def,
      `schema-subset.md:80 — pass 2's \`schema\`-body call ` +
        `(body-type-lowering.ts:577) reaches the arm through \`lowerObjectFields\`; ` +
        `observed ${JSON.stringify(def)}`,
    ).toEqual(expected);
    const lowered = annotationRoot("a5", "S", body);
    expect(
      JSON.stringify(lowered),
      `the annotation and body positions serve ONE declaration, so they must agree byte ` +
        `for byte; body=${JSON.stringify(def)} annotation=${JSON.stringify(lowered)}`,
    ).toBe(JSON.stringify(def));
  });

  it("RED (a6, ALIAS RHS): `schema X = \"x\" | \"y\"` lowers the spelled fragment, and `@<X>` agrees byte for byte", () => {
    const body = 'schema X = "x" | "y"';
    const def = bodyDef("a6", body, "X");
    expect(
      def,
      `schema-subset.md:80 — pass 2's alias/union right-hand-side call ` +
        `(body-type-lowering.ts:598) reaches the arm with the whole RHS; observed ` +
        `${JSON.stringify(def)}`,
    ).toEqual(XY_ENUM);
    const lowered = annotationRoot("a6", "X", body);
    expect(
      JSON.stringify(lowered),
      `an alias named at an annotation resolves to its own \`$defs\` body, so the two ` +
        `must agree byte for byte; body=${JSON.stringify(def)} ` +
        `annotation=${JSON.stringify(lowered)}`,
    ).toBe(JSON.stringify(def));
  });

  it("RED (a7, INLINE OBJECT): `lowerInlineObject('b: \"x\" | \"y\"')` carries the spelled fragment at its field", () => {
    const lowered = lowerInlineObject('b: "x" | "y"', noBodyTypes(), []);
    expect(
      lowered,
      `schema-subset.md:80 — every hoisting caller lowers its fields through ` +
        `\`lowerInlineObject\` (body-type-lowering.ts:153), which delegates to ` +
        `\`lowerObjectFields\`'s per-field call (:120), so the fragment a hoist hashes ` +
        `carries the spelled bytes; observed ${JSON.stringify(lowered)}`,
    ).toEqual(B_XY_FRAGMENT);
  });
});

// ===========================================================================
// (b) TWO SPELLINGS, ONE EMISSION — the named `enum` and the alias union are
// one rule at `:80`, so they are one fragment, one slug, one registration.
// Bug 0099 route A makes `respondSchemaSlug` the canonical-form slug
// (schema-subset.md §Canonical schema hash), which is WHY the two spellings
// collapse onto one slug regardless of key order — bug 0055's own `type`-first
// choice (body-type-lowering.ts:111) stays the emitted bytes but is not
// slug-bearing (bug 0099 §Fix retires that contract).
// ===========================================================================

const SEV_ENUM_BODY = 'enum Sev { Low = "low", High = "high" }';
const SEV_ALIAS_BODY = 'schema Sev = "low" | "high"';
/** The spelled fragment's `respondSchemaSlug` — the canonical-form slug (bug 0099 route A). */
const SEV_SLUG = "1aae0990d53b3485";

describe("bug 0055 (b) — one declared value set lowers to one fragment and one slug", () => {
  it("RED (b1): `enum Sev {…}` and `schema Sev = \"low\" | \"high\"` lower to IDENTICAL bytes", () => {
    const fromEnum = annotationRoot("b1", "Sev", SEV_ENUM_BODY);
    const fromAlias = annotationRoot("b1", "Sev", SEV_ALIAS_BODY);
    expect(
      JSON.stringify(fromAlias),
      `schema-subset.md:80 is ONE rule over both source forms, so the two spellings of ` +
        `one declared value set must produce one byte sequence; enum=` +
        `${JSON.stringify(fromEnum)} alias=${JSON.stringify(fromAlias)}`,
    ).toBe(JSON.stringify(fromEnum));
    expect(
      fromAlias,
      `schema-subset.md:80 spells \`type\` FIRST, matching \`lowerEnumToSchema\` ` +
        `(body-type-lowering.ts:100); observed ${JSON.stringify(fromAlias)}`,
    ).toEqual({ type: "string", enum: ["low", "high"] });
  });

  it("RED (b2): both spellings hash to ONE `respondSchemaSlug`, so one respond tool is registered", () => {
    const fromEnum = annotationRoot("b2", "Sev", SEV_ENUM_BODY);
    const fromAlias = annotationRoot("b2", "Sev", SEV_ALIAS_BODY);
    const enumSlug = respondSchemaSlug(fromEnum);
    const aliasSlug = respondSchemaSlug(fromAlias);
    expect(
      aliasSlug,
      `\`respondSchemaSlug\` (typed-query-validation.ts) hashes the CANONICAL form ` +
        `(bug 0099 route A), so the two source spellings — which lower to the SAME set of ` +
        `keys regardless of emission order — collapse onto one registration whatever their ` +
        `key order. enum=__theta_respond_${enumSlug} alias=__theta_respond_${aliasSlug}`,
    ).toBe(enumSlug);
    expect(
      aliasSlug,
      `the collapsed slug is the CANONICAL-FORM slug of ` +
        `\`{"type":"string","enum":["low","high"]}\` (bug 0099 route A); observed ${aliasSlug} ` +
        `over ${JSON.stringify(fromAlias)}`,
    ).toBe(SEV_SLUG);
  });

  it("RED (b3): both spellings ride the SAME respond-tool envelope payload", () => {
    // The envelope DECISION does not move — a non-object root is enveloped
    // either way, by two different clauses of `rootIsArgumentObjectSatisfiable`
    // — so what collapses is the payload schema the model is registered against.
    const fromEnum = annotationRoot("b3", "Sev", SEV_ENUM_BODY);
    const fromAlias = annotationRoot("b3", "Sev", SEV_ALIAS_BODY);
    for (const [label, lowered] of [
      ["enum", fromEnum],
      ["alias", fromAlias],
    ] as const) {
      expect(
        respondSchemaIsEnveloped(lowered),
        `a non-object root cannot be satisfied by ANY argument object, so the ${label} ` +
          `spelling must be enveloped; observed lowered=${JSON.stringify(lowered)}`,
      ).toBe(true);
    }
    const wire = respondToolWireSchema(fromAlias);
    expect(
      wire,
      `schema-subset.md:80 — the registered \`parameters\` and the QRY-15 instruction ` +
        `carry the lowered fragment verbatim, so an author moving a declaration between ` +
        `the two spellings must not change what the model is shown; observed ` +
        `${JSON.stringify(wire)}`,
    ).toEqual({
      type: "object",
      properties: { [RESPOND_ENVELOPE_KEY]: { type: "string", enum: ["low", "high"] } },
      required: [RESPOND_ENVELOPE_KEY],
    });
    expect(
      JSON.stringify(wire),
      `one declared value set registers ONE wire schema; enum=` +
        `${JSON.stringify(respondToolWireSchema(fromEnum))} alias=${JSON.stringify(wire)}`,
    ).toBe(JSON.stringify(respondToolWireSchema(fromEnum)));
  });
});

// ===========================================================================
// (c) REAL AJV OVER BOTH SPELLINGS — the admitted value set does not move, and
// the issue list gains the leading `type` entry.
// c1 is GREEN at HEAD and must stay green (the fix adds a redundant constraint
// to a set already closed by `enum`); c2 is RED.
// ===========================================================================

/** The thirteen probed payloads, the same set on both spellings. */
const PAYLOADS: readonly (readonly [string, unknown, boolean])[] = [
  ['"x"', "x", true],
  ['"y"', "y", true],
  ['"z"', "z", false],
  ['""', "", false],
  ["1", 1, false],
  ["0", 0, false],
  ["true", true, false],
  ["false", false, false],
  ["null", null, false],
  ["[]", [], false],
  ['["x"]', ["x"], false],
  ["{}", {}, false],
  ['{"x":1}', { x: 1 }, false],
];

describe("bug 0055 (c) — the production validator over both spellings", () => {
  it("CONTROL (c1): the admitted value set is identical on all thirteen payloads", () => {
    const fromUnion = lowerSource("c1", '"x" | "y"') as LoweredSchema;
    const fromEnum = bodyDef(
      "c1",
      'enum XY { X = "x", Y = "y" }',
      "XY",
    ) as LoweredSchema;
    const unionCompiled = ajv().compile(fromUnion);
    const enumCompiled = ajv().compile(fromEnum);
    for (const [label, payload, admitted] of PAYLOADS) {
      expect(
        unionCompiled.validate(payload).ok,
        `schema-subset.md:80 adds \`type\` to a set already closed by \`enum\`, so no ` +
          `payload changes verdict: ${label} against ${JSON.stringify(fromUnion)} must be ` +
          `${admitted ? "ACCEPTED" : "REJECTED"}`,
      ).toBe(admitted);
      expect(
        enumCompiled.validate(payload).ok,
        `the named-\`enum\` spelling of the same value set must agree: ${label} against ` +
          `${JSON.stringify(fromEnum)} must be ${admitted ? "ACCEPTED" : "REJECTED"}`,
      ).toBe(admitted);
    }
  });

  it("RED (c2): a non-string payload's issue list leads with the `type` entry", () => {
    // `allErrors: true` (schema-validator.ts:112) and the one-to-one AJV error
    // mapping (`:155–163`) put every entry in front of QRY-11 respond-repair and
    // the `invoke<T>` return-validation error, so the repair instruction an
    // author sees must not depend on which spelling of the value set they wrote.
    const fromUnion = lowerSource("c2", '"x" | "y"') as LoweredSchema;
    const fromEnum = bodyDef("c2", 'enum XY { X = "x", Y = "y" }', "XY") as LoweredSchema;
    const unionCompiled = ajv().compile(fromUnion);
    const enumCompiled = ajv().compile(fromEnum);
    for (const [label, payload] of [
      ["1", 1],
      ["null", null],
    ] as const) {
      const union = unionCompiled.validate(payload);
      const declared = enumCompiled.validate(payload);
      expect(
        union.ok,
        `fixture guard: ${label} is outside the declared value set`,
      ).toBe(false);
      expect(
        declared.ok,
        `fixture guard: ${label} is outside the declared value set`,
      ).toBe(false);
      const keywordsOf = (r: typeof union): string[] =>
        r.ok ? [] : r.errors.map((e) => e.keyword);
      expect(
        keywordsOf(union),
        `schema-subset.md:80 — with \`type\` present AJV reports the type violation ` +
          `first and the enum violation second, so the repair text is the same for both ` +
          `spellings; ${label} union=${JSON.stringify(keywordsOf(union))} ` +
          `enum=${JSON.stringify(keywordsOf(declared))}`,
      ).toEqual(["type", "enum"]);
      expect(
        keywordsOf(union),
        `the two spellings of one value set must produce one issue list; ${label} ` +
          `union=${JSON.stringify(keywordsOf(union))} ` +
          `enum=${JSON.stringify(keywordsOf(declared))}`,
      ).toEqual(keywordsOf(declared));
    }
    const outOfSet = unionCompiled.validate("z");
    expect(
      outOfSet.ok ? [] : outOfSet.errors.map((e) => e.keyword),
      `a STRING outside the set violates \`enum\` alone — the added \`type\` constrains ` +
        `only non-strings; observed ${JSON.stringify(outOfSet)}`,
    ).toEqual(["enum"]);
  });
});

// ===========================================================================
// (d) THE ALL-STRINGS GUARD, REFUSING DIRECTION — `:80` spells the emission for
// an enum or a STRING-literal union only, so a union carrying any non-string
// literal keeps the bare `enum` and a single literal keeps its `const`.
// GREEN at HEAD and must stay green: these are what keeps the fix from
// over-reaching.
// ===========================================================================

describe("bug 0055 (d) — a non-string literal form keeps its current fragment", () => {
  for (const [label, source, expected] of [
    ["numbers", "1 | 2", { enum: [1, 2] }],
    ["a string and null", '"x" | null', { enum: ["x", null] }],
    ["booleans", "true | false", { enum: [true, false] }],
    ["a string and a number", '"x" | 1', { enum: ["x", 1] }],
  ] as const) {
    it(`CONTROL (d, ${label}): \`${source}\` keeps the bare \`enum\` — SUBS-3 spells it`, () => {
      const lowered = lowerSource("d", source);
      expect(
        lowered,
        `SUBS-3 (schema-subset.md:80, anchor #subs-3) elects the bare enum form for a literal union not all of whose arms are strings; ` +
          `\`{"type":"string","enum":${JSON.stringify(
            (expected as { readonly enum: readonly unknown[] }).enum,
          )}}\` would refuse every value \`${source}\` declares, and :81 (SUBS-1) governs ` +
          `unions of \`PrimitiveType\`, not \`LiteralType\` arms (grammar.md:102). The ` +
          `emission stays as SUBS-3 elects; observed ${JSON.stringify(lowered)}`,
      ).toEqual(expected);
    });
  }

  it("CONTROL (d5, SINGLE LITERAL): `\"x\"` keeps its `const` — `:79` is a different rule", () => {
    const lowered = lowerSource("d5", '"x"');
    expect(
      lowered,
      `schema-subset.md:79 — a single literal of any type emits \`{"const": <value>}\`; ` +
        `the union arm's fix is confined to the multi-arm branch ` +
        `(body-type-lowering.ts:383–385) and leaves the single-literal branch (\`:390\`) ` +
        `untouched; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ const: "x" });
  });
});

// ===========================================================================
// (e) THE POSITIONS THE ARM DID NOT REACH — e1 is the row bug 0056 §Fix
// constraint 1 moved (the `params:` position joins the other three on 0055's
// emission), e2 the row bug 0164 §Fix moved (the generic ARGUMENT), e3 the row
// bug 0184 §Fix moved (the MIXED union's literal arm). Each of the three
// asymmetries was filed as its own report because each is a different recursion
// into `lowerTypeExpr`, and each cell keeps its subject with its bytes
// re-derived under the report that lifted it. e4 is the SUBS-1 control and stays
// green byte-for-byte.
// ===========================================================================

describe("bug 0055 (e) — the position bug 0056 reaches, and the three that stay unreached", () => {
  it("CONTROL (e1, `params:`): `p: \"x\" | \"y\"` carries the spelled fragment too", () => {
    // This position is REACHED now. Bug 0055 §Non-goals scoped its own fix to
    // the three `lowerTypeSource` positions and left the `params:` bytes
    // frozen; bug 0056 §Fix constraint 1 is the authority that lifts that
    // freeze for the all-literal class, by moving the recogniser and ONE shared
    // emission helper into `params.ts` and calling them from
    // `lowerParamsFieldType` ahead of its brace test
    // (docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md).
    // The emission this cell reads is still 0055's, verbatim and key-order
    // included — one helper, so the two positions cannot drift.
    const lowered = paramsSchema(
      "e1",
      `---\nmode: prompt\nparams:\n  p: "\\"x\\" | \\"y\\""\n---\n@\`use \${p}\`\n`,
    );
    expect(
      lowered,
      `schema-subset.md:80 is not scoped to a position and type-system.md:15 admits one answer ` +
        `per type expression, so the \`params:\` position emits the same bytes as the other ` +
        `three (bug 0056 §Fix constraint 1); observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { p: XY_ENUM },
      required: ["p"],
      additionalProperties: false,
    });
  });

  it("CONTROL (e2, GENERIC ARGUMENT): `array<\"x\" | \"y\">` carries the spelled fragment inside `items`", () => {
    const lowered = lowerSource("e2", 'array<"x" | "y">');
    expect(
      lowered,
      `bug 0055 §Non-goals — \`lowerTypeExpr\`'s \`array\` branch recursed into ITSELF, never ` +
        `back into \`lowerTypeSource\`, so the element type never reached the arm. THAT ` +
        `MECHANISM IS WHAT CHANGED: bug 0164 §Fix (v0.123.0) routes the generic-ARGUMENT ` +
        `recursion through the same \`lowerLiteralSublanguage\` this file's arm reaches at the ` +
        `whole source, so \`items\` now carries schema-subset.md:80's emission verbatim — ` +
        `\`type\` first — from ONE helper, which is why the two depths cannot drift. Bug 0164 ` +
        `§Fix is the authority that moved these bytes; the cell keeps its subject, this ` +
        `emission at the generic-argument position; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ type: "array", items: { type: "string", enum: ["x", "y"] } });
  });

  it("CONTROL (e3, MIXED UNION): `\"x\" | string` keeps `{\"anyOf\":[{\"const\":\"x\"},{\"type\":\"string\"}]}`", () => {
    const lowered = lowerSource("e3", '"x" | string');
    expect(
      lowered,
      `bug 0055 §Non-goals — \`parseLiteralArm\` (params.ts) fails on ` +
        `\`string\`, so the whole-union literal check never fires and the source goes ` +
        `whole to \`lowerTypeExpr\`. THAT MECHANISM IS UNCHANGED; THE DISPOSITION MOVED: bug ` +
        `0184 §Fix consults the same sublanguage PER ARM of a mixed union, so the whole-source ` +
        `decline still happens and the literal ARM now lowers schema-subset.md:79's ` +
        `\`{ "const": "x" }\` while \`string\` keeps its primitive \`{"type":"string"}\`. Bug ` +
        `0184 §Fix is the authority that moved these bytes; the cell keeps its subject, the ` +
        `mixed union's emission at this position; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ anyOf: [{ const: "x" }, { type: "string" }] });
  });

  it("CONTROL (e4, SUBS-1): `string | null` keeps the multi-type-array form", () => {
    const lowered = lowerSource("e4", "string | null");
    expect(
      lowered,
      `schema-subset.md:81 (SUBS-1) governs a union of \`PrimitiveType\` arms and is a ` +
        `DIFFERENT rule from :80; adding \`type\` at the literal arm must not reach it; ` +
        `observed ${JSON.stringify(lowered)}`,
    ).toEqual({ type: ["string", "null"] });
  });
});
