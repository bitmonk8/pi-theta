import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type {
  EnumDecl,
  SchemaDecl,
  ThetaDocument,
} from "../src/parser/theta-document";
import { productionSchemaSlugOf } from "../src/extension/production-composition";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  createRegistrationCache,
  registerToolInCache,
  type RegistrationCacheDeps,
  type RegistrationEntry,
} from "../src/runtime/tool-registration";
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0099 — one canonical schema hash, three sites that do not compute it.
// docs/bugs/0099-schema-slug-hashes-stringify-not-canonical-form.md, ROUTE A
// (implement the canonical form; the recipe in docs/spec_topics/schema-subset.md
// stands unchanged).
//
// THE RECIPE. docs/spec_topics/schema-subset.md:98 (step 1, input = the lowered
// fragment), :99–:105 (step 2, the canonical form: object keys sorted by Unicode
// code point, no insignificant whitespace, numeric `const` / `enum` literals by
// BNDR-4 / BNDR-5, array order untouched, RFC 8259 minimal string escapes), :106
// (step 3, SHA-256), :107 (step 4, first 16 lowercase hex), :108 (step 5, the
// four synthesised-name forms the slug mints into), :110 (the property the sort
// buys: the digest does not depend on emitted key order), :112 (§Schema-slug
// collision posture — each slug-keyed site stores the CANONICAL-FORM bytes so
// its equality check is a byte comparison).
//
// THE THREE ELEMENTS, EACH ROUTED THROUGH ONE RECIPE.
//  1. `respondSchemaSlug` (src/runtime/typed-query-validation.ts:347) delegates
//     to `schemaSlug(toLoweredJsonValue(lowered))` — the CANONICAL form, not
//     the emitted serialisation. It names `__theta_respond_<slug>` and
//     `__theta_bind_<slug>`, agreeing with `__inline_<slug>`
//     (src/parser/params.ts `hoistInlineObjectType`), which mints from the
//     same `canonicalForm` / `schemaSlug` (src/parser/schema-lowering.ts).
//  2. PIC-44 (docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:9)
//     requires the registration cache to store the canonical-form bytes;
//     src/extension/production-theta-producer.ts:2976 stores
//     `canonicalFormBytes: canonicalForm(toLoweredJsonValue(lowered))`, and the
//     byte comparison that reads them is src/runtime/tool-registration.ts:281.
//  3. PIC-11 (docs/spec_topics/pi-integration-contract/host-interfaces-services.md:46)
//     keys the per-query validator cache by the schema slug; the production
//     wiring (`productionSchemaSlugOf`,
//     src/extension/production-composition.ts:2728) returns
//     `{ slug: schemaSlug(v), canonicalBytes: canonicalForm(v) }` — a 16-hex
//     digest distinct from the bytes it is taken over.
//
// THE ORACLE IS INDEPENDENT OF THE IMPLEMENTATION. `canonicalForm` /
// `schemaSlug` / `toLoweredJsonValue` are NOT imported by this file (5a drives
// `productionSchemaSlugOf`, the one production entry point PIC-11 governs, but
// every EXPECTED value below is a hand-written canonical byte string hashed by
// this file's own `node:crypto` oracle). Group (0) keeps those hand-written
// canonical byte strings honest, so a red in groups (1)–(5) is a statement
// about the tree and not about a copied constant.
//
// NUMERIC POSITIONS ARE OUT OF SCOPE HERE. Step 2's numeric clause needs the
// declared `integer` / `number` kind (BNDR-4 / BNDR-5), which a plain JS object
// has lost; the emission of a union of non-string literals is itself unsettled
// (bug 0098). Every fragment below is key-order-only divergence on bytes the
// spec spells (`:80`, `:78`).

// ===========================================================================
// The lowered fragments, their hand-written canonical forms, and the shipped
// sources that produce them.
// ===========================================================================

/** `@<"low" | "high">` as emitted (schema-subset.md `:80`, `type` first). */
const LITUNION_FRAGMENT = { type: "string", enum: ["low", "high"] };

/** Its canonical form: `enum` (U+0065) sorts before `type` (U+0074). */
const LITUNION_CANONICAL = '{"enum":["low","high"],"type":"string"}';

/** `@<{ status: "ok" | "degraded", summary: string }>` as emitted. */
const OBJECT_FRAGMENT = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "degraded"] },
    summary: { type: "string" },
  },
  required: ["status", "summary"],
  additionalProperties: false,
};

/** Its canonical form: `additionalProperties` < `properties` < `required` < `type`. */
const OBJECT_CANONICAL =
  '{"additionalProperties":false,"properties":{"status":{"enum":["ok","degraded"],' +
  '"type":"string"},"summary":{"type":"string"}},"required":["status","summary"],' +
  '"type":"object"}';

/** `@<array<string>>` as emitted. */
const ARRAY_FRAGMENT = { type: "array", items: { type: "string" } };

/** Its canonical form: `items` (U+0069) sorts before `type` (U+0074). */
const ARRAY_CANONICAL = '{"items":{"type":"string"},"type":"array"}';

/** `@<Ghost>` — an unresolved named type lowers permissive: no keys to sort. */
const PERMISSIVE_FRAGMENT = {};

/** Its canonical form, the one fragment on which both recipes agree. */
const PERMISSIVE_CANONICAL = "{}";

/** `@<{ a: integer }>` — the fragment group (3) reaches at BOTH mints. */
const OBJINT_FRAGMENT = {
  type: "object",
  properties: { a: { type: "integer" } },
  required: ["a"],
  additionalProperties: false,
};

/** Its canonical form. */
const OBJINT_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"integer"}},' +
  '"required":["a"],"type":"object"}';

// ===========================================================================
// (0) THE INDEPENDENT ORACLE — green in both directions. `canonicalForm` and
// `schemaSlug` are not imported, so these cells are the whole warrant for the
// hand-written canonical byte strings above.
// ===========================================================================

/** Compare two strings by Unicode code point, as step 2 (`:100`) requires. */
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

/**
 * A local keys-sorted, whitespace-free serialiser over the plain-object domain
 * these fragments inhabit — step 2 (`:99`–`:105`) minus the numeric clause,
 * which no fragment here exercises. Written here rather than imported so a
 * change to the implementation cannot move the oracle with it.
 */
function sortedSerialise(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(sortedSerialise).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      (x, y) => compareCodePoint(x[0], y[0]),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${sortedSerialise(entryValue)}`)
      .join(",")}}`;
  }
  if (typeof value === "number") {
    throw new Error(
      "oracle scope: step 2's numeric clause (BNDR-4 / BNDR-5) needs the declared " +
        "integer/number kind, which a plain JS object has lost; no fragment in this file " +
        "carries a numeric `const`/`enum` position",
    );
  }
  return JSON.stringify(value);
}

/** SHA-256 of the canonical-form bytes, first 16 lowercase hex (`:106`, `:107`). */
function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** Every object key in a parsed canonical form is code-point sorted (`:100`). */
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
    `${label}: schema-subset.md:100 sorts object keys by Unicode code point; the keys at ` +
      `${path} read ${JSON.stringify(keys)}`,
  ).toEqual([...keys].sort(compareCodePoint));
  for (const key of keys) {
    assertKeysSorted(label, (value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

/** The fragment / canonical-form pairs every later group hashes. */
const ORACLE_ROWS: ReadonlyArray<readonly [string, string, unknown]> = [
  ['literal union `@<"low" | "high">`', LITUNION_CANONICAL, LITUNION_FRAGMENT],
  ["object `@<{ status: … , summary: string }>`", OBJECT_CANONICAL, OBJECT_FRAGMENT],
  ["array `@<array<string>>`", ARRAY_CANONICAL, ARRAY_FRAGMENT],
  ["permissive `@<Ghost>`", PERMISSIVE_CANONICAL, PERMISSIVE_FRAGMENT],
  ["object-integer `@<{ a: integer }>`", OBJINT_CANONICAL, OBJINT_FRAGMENT],
];

describe("bug 0099 (0) — oracle honesty", () => {
  for (const [label, canonical, fragment] of ORACLE_ROWS) {
    it(`0a (${label}): the hand-written canonical form is the keys-sorted, whitespace-free serialisation of the fragment it stands for`, () => {
      expect(
        JSON.parse(canonical),
        `0a ${label}: schema-subset.md:98 hashes the LOWERED fragment, so the hand-written ` +
          `bytes must parse back to exactly that fragment; observed ${canonical}`,
      ).toEqual(fragment);
      expect(
        canonical,
        `0a ${label}: schema-subset.md:101 forbids insignificant whitespace, and no key or ` +
          `value here contains a significant space; observed ${canonical}`,
      ).not.toMatch(/\s/);
      assertKeysSorted(`0a ${label}`, JSON.parse(canonical));
      expect(
        canonical,
        `0a ${label}: schema-subset.md:99–:105 — the hand-written bytes must equal this ` +
          `file's own keys-sorted serialisation of the fragment; observed ${canonical}`,
      ).toBe(sortedSerialise(fragment));
    });
  }

  it("0b: each canonical form's oracle slug is 16 lowercase hex characters, and distinct fragments carry distinct slugs", () => {
    for (const [label, canonical] of ORACLE_ROWS) {
      expect(
        slugOfCanonicalForm(canonical),
        `0b ${label}: schema-subset.md:107 — the first 16 hex characters of the SHA-256 ` +
          `digest, lowercased; observed ${slugOfCanonicalForm(canonical)}`,
      ).toMatch(/^[0-9a-f]{16}$/);
    }
    const slugs = ORACLE_ROWS.map(([, canonical]) => slugOfCanonicalForm(canonical));
    expect(
      new Set(slugs).size,
      `0b: schema-subset.md:98 — five pairwise-distinct fragments must carry five distinct ` +
        `slugs, or every equality below is vacuous; observed ${JSON.stringify(slugs)}`,
    ).toBe(ORACLE_ROWS.length);
  });
});

// ===========================================================================
// Shipped-path loaders. Every absent intermediate throws naming the unmet
// precondition; a refused parse must never read as a pass.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * Load `@<annotation>` through the SHIPPED path: `parseThetaDocument` for the
 * declarations and the diagnostics, then `lowerQueryResponseSchema` for the
 * annotation itself (the same pair the typed-query mechanism drives).
 */
function loweredAnnotation(cell: string, annotation: string, expectedCodes: readonly string[]): LoweredSchema {
  const doc = parseDoc(
    `---\nmode: prompt\n---\nlet r = @<${annotation}>\`hi\`\nr\n`,
    "bug0099.theta",
  );
  expect(
    doc.diagnostics.map((d) => d.code),
    `${cell}: the fixture's disposition is a precondition of the slug claim — a differently ` +
      `refused annotation lowers a different fragment; observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([...expectedCodes]);
  const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
  const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  if (lowered === undefined) {
    throw new Error(
      `${cell}: \`@<${annotation}>\` lowered to NOTHING, so there is no fragment for ` +
        `schema-subset.md:98 to hash and no respond tool to name`,
    );
  }
  return lowered;
}

// ===========================================================================
// (1) ELEMENT 1 — `respondSchemaSlug` must be the canonical-form slug.
// RED at HEAD: 1a, 1b, 1c (key-order divergence). 1d is the unchanged control
// (`{}` has no keys, so both recipes agree).
// ===========================================================================

interface Element1Row {
  readonly cell: string;
  readonly annotation: string;
  readonly codes: readonly string[];
  readonly emitted: unknown;
  readonly canonical: string;
}

const ELEMENT1_ROWS: readonly Element1Row[] = [
  {
    cell: "1a",
    annotation: '"low" | "high"',
    codes: [],
    emitted: LITUNION_FRAGMENT,
    canonical: LITUNION_CANONICAL,
  },
  {
    cell: "1b",
    annotation: '{ status: "ok" | "degraded", summary: string }',
    codes: [],
    emitted: OBJECT_FRAGMENT,
    canonical: OBJECT_CANONICAL,
  },
  {
    cell: "1c",
    annotation: "array<string>",
    codes: [],
    emitted: ARRAY_FRAGMENT,
    canonical: ARRAY_CANONICAL,
  },
  {
    cell: "1d",
    annotation: "Ghost",
    codes: ["theta/parse/unresolved-named-type"],
    emitted: PERMISSIVE_FRAGMENT,
    canonical: PERMISSIVE_CANONICAL,
  },
];

describe("bug 0099 (1) — the respond mint's slug is the canonical-form slug", () => {
  for (const row of ELEMENT1_ROWS) {
    const expected = slugOfCanonicalForm(row.canonical);
    it(`${row.cell} (@<${row.annotation}>): __theta_respond_${expected}`, () => {
      const lowered = loweredAnnotation(row.cell, row.annotation, row.codes);
      // The emitted fragment is pinned FIRST: schema-subset.md:76–:85 owns the
      // emission and this fix leaves it alone (§Non-goals), so a moved emission
      // would make the slug claim below a claim about a different fragment.
      expect(
        lowered,
        `${row.cell}: schema-subset.md:76–:85 fixes the emission this fix does not touch; ` +
          `observed ${JSON.stringify(lowered)}`,
      ).toEqual(row.emitted);
      expect(
        respondSchemaSlug(lowered),
        `${row.cell}: schema-subset.md:99–:107 — the slug is the 16-hex SHA-256 truncation of ` +
          `the CANONICAL form ${row.canonical}, not of the emitted serialisation ` +
          `${JSON.stringify(lowered)}; observed ${respondSchemaSlug(lowered)}`,
      ).toBe(expected);
      expect(
        `__theta_respond_${respondSchemaSlug(lowered)}`,
        `${row.cell}: schema-subset.md:108 mints \`__theta_respond_<slug>\` from that one ` +
          `recipe, and the name is on the wire (QRY-12 / QRY-15); observed ` +
          `__theta_respond_${respondSchemaSlug(lowered)}`,
      ).toBe(`__theta_respond_${expected}`);
    });
  }
});

// ===========================================================================
// (2) KEY-ORDER INDEPENDENCE — the property schema-subset.md:110 buys. Two
// fragments differing ONLY in key insertion order are one canonical form and
// therefore one slug. Order-only: no hex constant is involved.
// RED at HEAD on both cells.
// ===========================================================================

describe("bug 0099 (2) — key insertion order does not move the slug", () => {
  it("2a: `{type,enum}` and `{enum,type}` are one canonical form and one slug", () => {
    const typeFirst: LoweredSchema = { type: "string", enum: ["low", "high"] };
    const enumFirst: LoweredSchema = { enum: ["low", "high"], type: "string" };
    expect(
      sortedSerialise(enumFirst),
      `2a: the two objects must share ONE canonical form or the independence claim is about ` +
        `two different fragments; observed ${sortedSerialise(typeFirst)} vs ` +
        `${sortedSerialise(enumFirst)}`,
    ).toBe(sortedSerialise(typeFirst));
    expect(
      respondSchemaSlug(enumFirst),
      `2a: schema-subset.md:110 — "changing source-level field order changes the emitted ` +
        `schema's property order but does not change the canonical hash"; observed ` +
        `${respondSchemaSlug(typeFirst)} (type-first) vs ${respondSchemaSlug(enumFirst)} ` +
        `(enum-first)`,
    ).toBe(respondSchemaSlug(typeFirst));
  });

  it("2b: an object fragment's four keys in emission order and in reverse mint one slug", () => {
    const emissionOrder: LoweredSchema = {
      type: "object",
      properties: { a: { type: "integer" } },
      required: ["a"],
      additionalProperties: false,
    };
    const reversed: LoweredSchema = {
      additionalProperties: false,
      required: ["a"],
      properties: { a: { type: "integer" } },
      type: "object",
    };
    expect(
      sortedSerialise(reversed),
      `2b: both orders must share ONE canonical form; observed ${sortedSerialise(emissionOrder)} ` +
        `vs ${sortedSerialise(reversed)}`,
    ).toBe(sortedSerialise(emissionOrder));
    expect(
      respondSchemaSlug(reversed),
      `2b: schema-subset.md:110 — the digest is taken over the SORTED form, so the emitted ` +
        `order src/parser/body-type-lowering.ts \`lowerObjectFields\` happens to write cannot ` +
        `reach it; observed ${respondSchemaSlug(emissionOrder)} (emission order) vs ` +
        `${respondSchemaSlug(reversed)} (reversed)`,
    ).toBe(respondSchemaSlug(emissionOrder));
  });
});

// ===========================================================================
// (3) ONE FRAGMENT, ONE SLUG ACROSS MINTS — schema-subset.md:108 names four
// synthesised-name forms minted from ONE recipe. `__inline_<slug>` is reached
// through the shipped load path (a `params:` inline object hoisted by
// `hoistInlineObjectType`, src/parser/params.ts), `__theta_respond_<slug>`
// through `respondSchemaSlug`, over a BYTE-IDENTICAL fragment.
// RED at HEAD.
// ===========================================================================

/** The `$defs` map of a `params:` block that must load clean. */
function paramsDefs(cell: string, source: string): Record<string, unknown> {
  const doc = parseDoc(source, "bug0099-params.theta");
  expect(
    diagLines(doc),
    `${cell}: an inline object type is legal theta in the \`params:\` position, so the ` +
      `hoisting fixture must load clean or there is no \`__inline_<slug>\` mint to compare ` +
      `against; observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  const params = doc.frontmatter?.params;
  if (params === undefined) {
    throw new Error(
      `${cell}: the loaded theta carries no parsed \`params:\` block, so the hoist never ran. ` +
        `Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${cell}: the \`params:\` block lowered to NOTHING, so no \`$defs\` entry was minted. ` +
        `Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const defs = lowered["$defs"];
  if (defs === undefined || typeof defs !== "object" || defs === null) {
    throw new Error(
      `${cell}: the lowered \`params:\` document carries no \`$defs\` object, so the inline ` +
        `object was not hoisted: ${JSON.stringify(lowered)}`,
    );
  }
  return defs as Record<string, unknown>;
}

describe("bug 0099 (3) — one lowered fragment carries one slug at every mint", () => {
  it("3a: `__inline_<slug>` and `__theta_respond_<slug>` agree on `{ a: integer }`", () => {
    const defs = paramsDefs(
      "3a",
      ["---", "mode: prompt", "params:", "  p: '{a: integer}'", "---", "let x = 1", "x", ""].join(
        "\n",
      ),
    );
    const defNames = Object.keys(defs);
    expect(
      defNames.length,
      `3a: the fixture declares exactly ONE inline object, so exactly one \`$defs\` entry may ` +
        `be minted; observed ${JSON.stringify(defNames)}`,
    ).toBe(1);
    const defName = defNames[0] ?? "";
    // The hoisted body is pinned before its name is read: the two mints must be
    // compared over ONE fragment, not two that merely look alike.
    expect(
      defs[defName],
      `3a: schema-subset.md:73 hoists the LOWERED fragment, and the respond side below lowers ` +
        `the same shape; observed ${JSON.stringify(defs[defName])}`,
    ).toEqual(OBJINT_FRAGMENT);
    const inlineSlug = defName.replace(/^__inline_/, "");
    expect(
      inlineSlug,
      `3a: schema-subset.md:108 spells the hoisted key \`__inline_<slug>\`; observed ${defName}`,
    ).toMatch(/^[0-9a-f]{16}$/);
    expect(
      inlineSlug,
      `3a: the \`__inline_\` mint already follows schema-subset.md:99–:107 over ` +
        `${OBJINT_CANONICAL}; observed ${defName}`,
    ).toBe(slugOfCanonicalForm(OBJINT_CANONICAL));

    const lowered = loweredAnnotation("3a", "{ a: integer }", []);
    expect(
      lowered,
      `3a: the respond side must hash the SAME fragment the hoist stored; observed ` +
        `${JSON.stringify(lowered)}`,
    ).toEqual(OBJINT_FRAGMENT);
    expect(
      respondSchemaSlug(lowered),
      `3a: schema-subset.md:108 mints all four synthesised-name forms from ONE recipe, so one ` +
        `fragment cannot carry two slugs in one build; observed __inline_${inlineSlug} vs ` +
        `__theta_respond_${respondSchemaSlug(lowered)}`,
    ).toBe(inlineSlug);
  });
});

// ===========================================================================
// (4) ELEMENT 2 (PIC-44) — the registration cache's stored bytes.
//
// The producer's respond mint (src/extension/production-theta-producer.ts:2969
// `#registerRespondTool`) holds its cache privately
// (`#respondRegistrationCache`, `:735`) and exposes no read seam, so the bytes
// it stores are not observable from any test — the equality check that reads
// them (src/runtime/tool-registration.ts:281) is only reachable on a slug
// match. 4a and 4b therefore drive the EXPORTED entry point
// `registerToolInCache` with the entry PIC-44 specifies
// (docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:9:
// "the canonical-form bytes alongside the registered name"), which is the pair
// Route A makes the producer construct; 4c gates the producer line itself,
// because that unreachability is what leaves the recipe behaviourally
// indiscriminable.
// RED at HEAD on 4a, 4b and 4c.
// ===========================================================================

/** A recording `pi.registerTool` plus the collision diagnostics fired. */
function registrationDeps(): {
  readonly deps: RegistrationCacheDeps;
  readonly registered: string[];
  readonly emitted: Diagnostic[];
} {
  const registered: string[] = [];
  const emitted: Diagnostic[] = [];
  return {
    deps: {
      registerTool: (name: string): void => {
        registered.push(name);
      },
      emitDiagnostic: (diagnostic: Diagnostic): void => {
        emitted.push(diagnostic);
      },
    },
    registered,
    emitted,
  };
}

describe("bug 0099 (4) — PIC-44's stored bytes are the bytes the slug digests", () => {
  it("4a: the canonical-form bytes PIC-44 stores digest to the slug the mint keys on", () => {
    const lowered = loweredAnnotation("4a", '"low" | "high"', []);
    expect(
      slugOfCanonicalForm(LITUNION_CANONICAL),
      `4a: PIC-44 (tool-registration-lifetime.md:9) stores the CANONICAL-FORM bytes and ` +
        `schema-subset.md:112 requires the byte comparison to be over the bytes the digest is ` +
        `taken of, so the stored bytes' own slug must be the cache key the mint computes; ` +
        `observed canonical ${LITUNION_CANONICAL} → ${slugOfCanonicalForm(LITUNION_CANONICAL)} ` +
        `against mint slug ${respondSchemaSlug(lowered)}`,
    ).toBe(respondSchemaSlug(lowered));
  });

  it("4b: two key-order spellings of one canonical fragment share one registration", () => {
    const typeFirst: LoweredSchema = { type: "string", enum: ["low", "high"] };
    const enumFirst: LoweredSchema = { enum: ["low", "high"], type: "string" };
    // Both entries carry the SAME canonical-form bytes because both spellings
    // have the same canonical form; PIC-44's byte comparison is over those
    // bytes, so the dedup turns entirely on the slug the mint keys with.
    const entryOf = (lowered: LoweredSchema): RegistrationEntry => ({
      kind: "respond",
      slug: respondSchemaSlug(lowered),
      canonicalFormBytes: LITUNION_CANONICAL,
    });
    const cache = createRegistrationCache();
    const { deps, registered, emitted } = registrationDeps();

    const firstName = registerToolInCache(cache, entryOf(typeFirst), deps);
    const secondName = registerToolInCache(cache, entryOf(enumFirst), deps);

    expect(
      secondName,
      `4b: PIC-44 (tool-registration-lifetime.md:9) — "subsequent uses of the same lowered ` +
        `shape reuse the existing registration", and schema-subset.md:110 makes these two ` +
        `spellings the same shape; observed ${firstName} then ${secondName}`,
    ).toBe(firstName);
    expect(
      registered,
      `4b: schema-subset.md:108 mints ONE \`__theta_respond_<slug>\` for one canonical ` +
        `fragment, so exactly one \`pi.registerTool\` call is owed; observed ` +
        `${JSON.stringify(registered)}`,
    ).toEqual([`__theta_respond_${slugOfCanonicalForm(LITUNION_CANONICAL)}`]);
    expect(
      emitted.map((d) => d.code),
      `4b: \`theta/runtime/registration-cache-collision\` reports two DISTINCT fragments on ` +
        `one slug; two spellings of one canonical form are not that; observed ` +
        `${JSON.stringify(emitted.map((d) => d.code))}`,
    ).toEqual([]);
  });

  // 4c IS A SOURCE GATE, AND THAT IS THE ONLY HONEST SHAPE FOR IT. The bytes
  // the producer's respond mint stores are read at exactly ONE place —
  // `existing.canonicalFormBytes === entry.canonicalFormBytes`
  // (src/runtime/tool-registration.ts:281) — which is reached only when two
  // entries share a slug. Two DIFFERENT lowered fragments sharing a 16-hex
  // slug is a 64-bit digest collision, which bug 0099 §Non-goals puts out of
  // scope and which cannot be constructed here; the SAME fragment yields
  // byte-equal bytes under either recipe, so its dedup is identical either
  // way. No input to the producer can therefore make the stored bytes' RECIPE
  // observable, and a behavioural witness built by widening the producer's
  // seams would be asserting an implementation detail. The gate reds on the
  // one line PIC-44 constrains instead, in both directions, so neither a
  // revert nor a rename of the bridged fragment slips through.
  it("4c (source gate): the producer's respond mint stores the CANONICAL-FORM bytes, not the emitted serialisation", () => {
    const producerPath = "src/extension/production-theta-producer.ts";
    const source = readFileSync(
      fileURLToPath(new URL(`../${producerPath}`, import.meta.url)),
      "utf8",
    );

    // PRECONDITIONS FIRST, each naming itself: a slice that missed its region
    // must never read as a pass.
    const methodName = "#registerRespondTool(lowered: LoweredSchema)";
    const declarations = source.split(methodName).length - 1;
    expect(
      declarations,
      `4c: this gate locates the respond mint by SYMBOL, not by line number, and found ` +
        `${declarations} declarations of \`${methodName}\` in ${producerPath}. Exactly one is ` +
        `required — zero means the method was renamed and this gate is checking nothing`,
    ).toBe(1);
    const declarationStart = source.indexOf(methodName);
    // The method body ends at the first closing brace written at class-member
    // indentation, the shape every member in this class closes with.
    const bodyEnd = source.indexOf("\n  }\n", declarationStart);
    expect(
      bodyEnd,
      `4c: no class-member-indented closing brace follows \`${methodName}\` in ${producerPath}, ` +
        `so the method body could not be delimited and there is no region to gate`,
    ).toBeGreaterThan(declarationStart);
    const region = source.slice(declarationStart, bodyEnd);
    expect(
      region.length,
      `4c: the located \`${methodName}\` region is empty, so every assertion below would be ` +
        `vacuous`,
    ).toBeGreaterThan(0);

    const mintCalls = region.split("registerToolInCache(").length - 1;
    expect(
      mintCalls,
      `4c: PIC-44's entry is constructed at the \`registerToolInCache(\` call inside ` +
        `\`${methodName}\`; the located region carries ${mintCalls} such calls, and only ONE ` +
        `has a single \`canonicalFormBytes:\` to gate. Region: ${JSON.stringify(region)}`,
    ).toBe(1);

    // The expression runs to the property separator, the end of the object
    // literal, or the end of the line; a same-line closing brace of the entry
    // literal is not part of it.
    const byteExpressions = [...region.matchAll(/canonicalFormBytes:\s*([^,\n]+)/g)].map((m) =>
      (m[1] ?? "").replace(/[\s}]+$/, ""),
    );
    expect(
      byteExpressions.length,
      `4c: exactly one \`canonicalFormBytes:\` property is owed inside \`${methodName}\`; ` +
        `observed ${JSON.stringify(byteExpressions)}`,
    ).toBe(1);
    const observed = byteExpressions[0] ?? "";

    // PIC-44 (docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:9)
    // requires "the canonical-form bytes alongside the registered name so the
    // equality check is a byte comparison", and schema-subset.md:112
    // (§Schema-slug collision posture) makes those the bytes the slug is the
    // digest OF. The bridged fragment is `toLoweredJsonValue(lowered)` — the
    // same value `respondSchemaSlug` hashes — so the stored bytes and the cache
    // key cannot be taken over two different documents.
    expect(
      observed,
      `4c: PIC-44 (tool-registration-lifetime.md:9) stores "the canonical-form bytes alongside ` +
        `the registered name so the equality check is a byte comparison", and ` +
        `schema-subset.md:112 makes them the bytes the slug digests — that is ` +
        `\`canonicalForm(toLoweredJsonValue(lowered))\` over the same bridged fragment ` +
        `\`respondSchemaSlug\` hashes; observed \`${observed}\``,
    ).toMatch(/^canonicalForm\(\s*toLoweredJsonValue\(\s*lowered\s*\)\s*\)$/);
    expect(
      observed,
      `4c: the emitted serialisation \`JSON.stringify(lowered)\` is the recipe bug 0099 names ` +
        `as the defect — it digests emission key order, which schema-subset.md:110 says the ` +
        `canonical hash must not depend on; observed \`${observed}\``,
    ).not.toMatch(/JSON\.stringify/);
  });
});

// ===========================================================================
// (5) ELEMENT 3 (PIC-11) — the per-query validator cache is keyed by the slug.
//
// The production wiring is `productionSchemaSlugOf`
// (src/extension/production-composition.ts), a named export `buildRuntimeRoot`
// passes as `slugOf` — extracted from its former module-private closure
// specifically so this cell is a behavioural assertion over the function
// PIC-11 governs, not a source-text pattern match over the module that
// contains it. 5a drives that export directly against the same canonical-form
// oracle as groups (0)–(4); 5b pins the reachable half — the collision arm
// (src/seams/schema-validator.ts:126–:136) that a 16-hex slug revives.
// RED at HEAD: 5a. 5b is a control, green in both directions.
// ===========================================================================

describe("bug 0099 (5) — PIC-11's cache key is a slug, not the schema document", () => {
  it("5a: the production `slugOf` returns a 16-hex slug, not the schema serialisation", () => {
    const { slug, canonicalBytes } = productionSchemaSlugOf(LITUNION_FRAGMENT);
    // PIC-11 (host-interfaces-services.md:46) keys the cache "by the schema slug
    // of the lowered per-query schema document (per Canonical schema hash)":
    // steps 3 and 4 (schema-subset.md:106, :107) make that 16 hex characters,
    // distinct from step 2's canonical-form bytes (`:99`–`:105`) the entry
    // stores separately for the byte comparison.
    expect(
      slug.length,
      `5a: schema-subset.md:107 — the slug is the first 16 hex characters; observed ${slug}`,
    ).toBe(16);
    expect(
      slug,
      `5a: schema-subset.md:106–:107 — SHA-256 truncated to 16 lowercase hex; observed ${slug}`,
    ).toMatch(/^[0-9a-f]{16}$/);
    expect(
      slug,
      `5a: the slug and the canonical-form bytes are DISTINCT values — a slug that IS a ` +
        `serialisation of the document is the whole schema used as the map key and interpolated ` +
        `into \`theta/runtime/validator-cache-collision\` (src/seams/schema-validator.ts:133); ` +
        `observed slug ${slug} canonicalBytes ${canonicalBytes}`,
    ).not.toBe(canonicalBytes);
    expect(
      slug,
      `5a: the slug must be THIS file's own canonical-form oracle slug over ` +
        `${LITUNION_CANONICAL}; observed ${slug}`,
    ).toBe(slugOfCanonicalForm(LITUNION_CANONICAL));
    expect(
      canonicalBytes,
      `5a: the canonical bytes must equal this file's hand-written canonical byte string; ` +
        `observed ${canonicalBytes}`,
    ).toBe(LITUNION_CANONICAL);
  });

  it("5b (control): a 16-hex slug keeps the byte comparison and the collision arm live", () => {
    // The reachable half of element 3: with a slug that is a 16-hex digest
    // rather than the document itself, two distinct documents CAN share a key,
    // so the byte comparison (src/seams/schema-validator.ts:123) decides and
    // the collision arm (`:126`–`:136`) is reachable. The seam admits an
    // injected fixed-slug function for exactly this (`:69`–`:72`).
    const SLUG = "deadbeefdeadbeef";
    const emitted: Diagnostic[] = [];
    const slugOf = (schema: LoweredSchema): SchemaSlug => ({
      slug: SLUG,
      canonicalBytes: sortedSerialise(schema),
    });
    const validator = new AjvSchemaValidator({
      emit: (d: Diagnostic): void => {
        emitted.push(d);
      },
      slugOf,
    });
    validator.compile({ type: "string" });
    const second = validator.compile({ type: "number" });
    expect(
      emitted.map((d) => d.code),
      `5b: PIC-11 (host-interfaces-services.md:46) recompiles and emits ` +
        `\`theta/runtime/validator-cache-collision\` instead of serving the wrong cached ` +
        `validator; observed ${JSON.stringify(emitted.map((d) => d.code))}`,
    ).toEqual(["theta/runtime/validator-cache-collision"]);
    expect(
      emitted[0]?.message,
      `5b: schema-subset.md:112 keys that message on the SLUG; observed ${emitted[0]?.message}`,
    ).toBe(`validator-cache collision on slug ${SLUG}: two distinct schema documents hash alike`);
    expect(
      second.validate(42).ok,
      `5b: the arm must serve the NEW document's validator, not the cached one; observed ` +
        `${JSON.stringify(second.validate(42))}`,
    ).toBe(true);
  });
});

// ===========================================================================
// (6) THE BRIDGE'S DOMAIN IS HOST-SUPPLIED, NOT THETA-LOWERED. PIC-11
// (host-interfaces-services.md:46) keys the per-query validator cache through
// `productionSchemaSlugOf`, and the pre-dispatch AJV safety net drives that
// key over `PiToolDispatch.parameters` — a FOREIGN `unknown` from the host
// tool registry (src/extension/production-theta-producer.ts
// `#checkPiToolArgSchema`), admitted behind only an
// object/non-null/non-array guard. An ordinary TS object carrying
// `description: undefined` reaches the bridge, so the bridge owes every JS
// value an answer.
//
// The answer is `JSON.stringify`'s, because step 2 (schema-subset.md:99–:105)
// is a digest of the fragment AS A JSON DOCUMENT: a value JSON cannot
// represent is absent from that document rather than rendered into it. An
// object property holding `undefined` is OMITTED; an array element holding
// `undefined` becomes `null`.
// ===========================================================================

/** A host object carrying an `undefined`-valued own property. */
const HOSTUNDEF_FRAGMENT: LoweredSchema = { type: "object", required: undefined };

/** Its canonical form: the `undefined`-valued key is not in the JSON document. */
const HOSTUNDEF_CANONICAL = '{"type":"object"}';

/** A host object with an explicit `undefined` array element — `enum`'s second. */
const ARRAYHOLE_FRAGMENT: LoweredSchema = { type: "string", enum: ["low", undefined] };

/** Its canonical form: an array's length is part of its value, so the element is `null`. */
const ARRAYHOLE_CANONICAL = '{"enum":["low",null],"type":"string"}';

interface NonFiniteRow {
  readonly label: string;
  /** A host fragment carrying a non-finite number JSON cannot represent. */
  readonly fragment: LoweredSchema;
  /** The same fragment with that value written as `JSON.stringify` writes it. */
  readonly nulled: LoweredSchema;
  /** The hand-written canonical form, code-point sorted and whitespace-free. */
  readonly canonical: string;
}

const NONFINITE_ROWS: readonly NonFiniteRow[] = [
  {
    label: "`maximum: Infinity`",
    fragment: { type: "number", maximum: Infinity },
    nulled: { type: "number", maximum: null },
    canonical: '{"maximum":null,"type":"number"}',
  },
  {
    label: "`multipleOf: NaN`",
    fragment: { type: "number", multipleOf: NaN },
    nulled: { type: "number", multipleOf: null },
    canonical: '{"multipleOf":null,"type":"number"}',
  },
  {
    label: "`minimum: -Infinity`",
    fragment: { type: "number", minimum: -Infinity },
    nulled: { type: "number", minimum: null },
    canonical: '{"minimum":null,"type":"number"}',
  },
  {
    label: "`enum: [1, Infinity]` (ARRAY element)",
    fragment: { enum: [1, Infinity] },
    nulled: { enum: [1, null] },
    canonical: '{"enum":[1,null]}',
  },
];

describe("bug 0099 (6) — the bridge mirrors the JSON data model over host-supplied values", () => {
  it("6a: an `undefined`-valued property is absent from the digest, and the slug is the canonical-form slug of the document without it", () => {
    const expected = slugOfCanonicalForm(HOSTUNDEF_CANONICAL);
    // `productionSchemaSlugOf` is the PIC-11 entry point the safety net reaches;
    // a throw here is an uncaught `TypeError` inside tool dispatch, before Ajv.
    const { slug, canonicalBytes } = productionSchemaSlugOf(HOSTUNDEF_FRAGMENT);
    expect(
      canonicalBytes,
      `6a: schema-subset.md:99–:105 digests the fragment as a JSON DOCUMENT, and JSON has no ` +
        `\`required\` key here, so the canonical form is ${HOSTUNDEF_CANONICAL}; observed ` +
        `${canonicalBytes}`,
    ).toBe(HOSTUNDEF_CANONICAL);
    expect(
      slug,
      `6a: schema-subset.md:106–:107 — the slug is the 16-hex SHA-256 truncation of ` +
        `${HOSTUNDEF_CANONICAL}, this file's own hand-written oracle giving ${expected}; ` +
        `observed ${slug}`,
    ).toBe(expected);
    expect(
      productionSchemaSlugOf({ type: "object" }).slug,
      `6a: the \`undefined\`-valued key must not move the digest, so the host object and the ` +
        `document JSON says it is must carry ONE slug; observed ${slug} vs ` +
        `${productionSchemaSlugOf({ type: "object" }).slug}`,
    ).toBe(slug);
  });

  it("6b: an `undefined` ARRAY element canonicalises to `null`, not to an omission", () => {
    const expected = slugOfCanonicalForm(ARRAYHOLE_CANONICAL);
    const { slug, canonicalBytes } = productionSchemaSlugOf(ARRAYHOLE_FRAGMENT);
    expect(
      canonicalBytes,
      `6b: schema-subset.md:104 leaves array order (and therefore array length) untouched, and ` +
        `JSON.stringify writes \`null\` for an unrepresentable element rather than dropping it, ` +
        `so the canonical form is ${ARRAYHOLE_CANONICAL}; observed ${canonicalBytes}`,
    ).toBe(ARRAYHOLE_CANONICAL);
    expect(
      slug,
      `6b: the slug must be this file's own oracle slug over ${ARRAYHOLE_CANONICAL}, ` +
        `${expected}; observed ${slug}`,
    ).toBe(expected);
    expect(
      slug,
      `6b: dropping the hole instead of writing \`null\` would mint the slug of ` +
        `${LITUNION_CANONICAL.replace('"low","high"', '"low"')} — a two-element \`enum\` and a ` +
        `one-element \`enum\` are different documents; observed ${slug}`,
    ).not.toBe(slugOfCanonicalForm('{"enum":["low"],"type":"string"}'));
  });

  it("6c: the bridge and `JSON.stringify` agree on the KEY SET of an object carrying an `undefined` property", () => {
    // Key ORDER is deliberately not compared: step 2 (schema-subset.md:100)
    // sorts by Unicode code point where `JSON.stringify` walks insertion order,
    // which is the whole point of the canonical form (`:110`). The claim is
    // about MEMBERSHIP — the property is in neither serialisation.
    const stringified = JSON.stringify(HOSTUNDEF_FRAGMENT);
    if (stringified === undefined) {
      throw new Error(
        "6c: `JSON.stringify` produced no document for the fixture, so there is no key set to " +
          "compare the bridge against",
      );
    }
    const stringifyKeys = Object.keys(JSON.parse(stringified) as Record<string, unknown>).sort(
      compareCodePoint,
    );
    const bridgeKeys = Object.keys(
      JSON.parse(productionSchemaSlugOf(HOSTUNDEF_FRAGMENT).canonicalBytes) as Record<
        string,
        unknown
      >,
    ).sort(compareCodePoint);
    expect(
      bridgeKeys,
      `6c: the canonical form is the digest of the JSON DOCUMENT, so the bridge's key set must ` +
        `be JSON.stringify's; observed bridge ${JSON.stringify(bridgeKeys)} vs stringify ` +
        `${JSON.stringify(stringifyKeys)}`,
    ).toEqual(stringifyKeys);
    expect(
      bridgeKeys,
      `6c: \`required\` is the \`undefined\`-valued own property, so it is in NEITHER ` +
        `serialisation; observed ${JSON.stringify(bridgeKeys)}`,
    ).not.toContain("required");
  });

  // A NON-FINITE number has no JSON representation either, and `JSON.stringify`
  // resolves it the same way in every position: `JSON.stringify({ a: NaN })` is
  // `{"a":null}` and `JSON.stringify([Infinity])` is `[null]`. It is neither
  // omitted (that is `undefined`) nor refused (that is `bigint`, the one value
  // `JSON.stringify` itself throws on), so the bridge writes `null` and the
  // digested bytes stay a JSON document any implementation can reproduce
  // (schema-subset.md:94, :110). An extension author's
  // `{ type: "number", maximum: Infinity }` reaches the bridge through the same
  // `PiToolDispatch.parameters` door group (6) opens above.
  for (const row of NONFINITE_ROWS) {
    it(`6d (${row.label}): a non-finite number canonicalises to \`null\`, and the bytes stay a JSON document`, () => {
      const expected = slugOfCanonicalForm(row.canonical);
      const { slug, canonicalBytes } = productionSchemaSlugOf(row.fragment);
      expect(
        () => JSON.parse(canonicalBytes),
        `6d ${row.label}: schema-subset.md:99–:105 digests the fragment AS A JSON DOCUMENT, so ` +
          `a bare \`Infinity\`/\`NaN\` token in the bytes is not a document at all; observed ` +
          `${canonicalBytes}`,
      ).not.toThrow();
      expect(
        JSON.parse(canonicalBytes),
        `6d ${row.label}: \`JSON.stringify\` writes \`null\` for a non-finite number in every ` +
          `position, so the bytes must parse back to ${JSON.stringify(row.nulled)}; observed ` +
          `${canonicalBytes}`,
      ).toEqual(row.nulled);
      assertKeysSorted(`6d ${row.label}`, JSON.parse(canonicalBytes));
      expect(
        canonicalBytes,
        `6d ${row.label}: the canonical form is this file's hand-written ${row.canonical}; ` +
          `observed ${canonicalBytes}`,
      ).toBe(row.canonical);
      expect(
        slug,
        `6d ${row.label}: schema-subset.md:106–:107 — the slug is this file's own oracle slug ` +
          `over ${row.canonical}, ${expected}; observed ${slug}`,
      ).toBe(expected);
      expect(
        productionSchemaSlugOf(row.nulled).slug,
        `6d ${row.label}: the host fragment and the document JSON says it is must carry ONE ` +
          `slug; observed ${productionSchemaSlugOf(row.nulled).slug} vs ${slug}`,
      ).toBe(slug);
    });
  }

  it("6e: the bridge's bytes and `JSON.stringify` parse to the same structure for a fragment carrying a non-finite value", () => {
    // Key ORDER is again irrelevant (step 2 sorts, `JSON.stringify` does not);
    // the claim is that the two serialisations describe the SAME document. That
    // is the property behind the disposition's second reason: a non-finite
    // value hashed as `null` before this fix hashes as `null` after it, so the
    // PIC-44 stored bytes and any replayed provider payload still agree.
    for (const row of NONFINITE_ROWS) {
      const stringified = JSON.stringify(row.fragment);
      if (stringified === undefined) {
        throw new Error(
          `6e (${row.label}): \`JSON.stringify\` produced no document for the fixture, so there ` +
            `is no structure to compare the bridge against`,
        );
      }
      const bridgeBytes = productionSchemaSlugOf(row.fragment).canonicalBytes;
      expect(
        JSON.parse(bridgeBytes),
        `6e (${row.label}): the canonical form is a digest of the JSON DOCUMENT, so the bridge ` +
          `and \`JSON.stringify\` must describe the same one; observed bridge ${bridgeBytes} vs ` +
          `stringify ${stringified}`,
      ).toEqual(JSON.parse(stringified));
    }
  });

  // The remaining cells cover the JS shapes whose JSON representation is not a
  // function of the value alone but of ECMA-262's `SerializeJSONProperty`: an
  // ELIDED array element (no own property at that index), a value carrying
  // `toJSON`, a boxed primitive, and a circular structure. All four reach the
  // bridge through the same `PiToolDispatch.parameters` door, and all four are
  // resolved at the PIC-11 boundary by `productionSchemaSlugOf`, so these
  // cells drive that exported function rather than the bridge directly.

  it("6f: an ELIDED array element canonicalises to `null`, not to empty text", () => {
    // An elided literal, not an explicit `undefined`: the array has no own
    // property at index 1, which is the shape `Array.prototype.map` skips.
    const fragment: LoweredSchema = { enum: [1, , 3] };
    const canonical = '{"enum":[1,null,3]}';
    const expected = slugOfCanonicalForm(canonical);
    const { slug, canonicalBytes } = productionSchemaSlugOf(fragment);
    expect(
      JSON.parse(canonicalBytes),
      `6f: schema-subset.md:99–:105 digests the fragment AS A JSON DOCUMENT, so the bytes must ` +
        `parse back to a three-element \`enum\` whose middle element is \`null\`; observed ` +
        `${canonicalBytes}`,
    ).toEqual({ enum: [1, null, 3] });
    expect(
      canonicalBytes,
      `6f: an array's length is part of its value, so the empty index is written as \`null\` ` +
        `and the canonical form is ${canonical}; rendering it as empty text yields ` +
        `\`[1,,3]\`, which is not JSON at all; observed ${canonicalBytes}`,
    ).toBe(canonical);
    expect(
      slug,
      `6f: schema-subset.md:106–:107 — the slug is this file's own oracle slug over ` +
        `${canonical}, ${expected}; observed ${slug}`,
    ).toBe(expected);
    expect(
      slug,
      `6f: the elided element and the \`null\` JSON says it is are ONE document, so they must ` +
        `carry one slug; observed ${slug} vs ` +
        `${productionSchemaSlugOf({ enum: [1, null, 3] }).slug}`,
    ).toBe(productionSchemaSlugOf({ enum: [1, null, 3] }).slug);
  });

  it("6g: a `toJSON`-bearing value canonicalises to its `toJSON` result, and does not collapse onto the empty object", () => {
    const fragment: LoweredSchema = { default: new Date(0), type: "string" };
    const canonical = '{"default":"1970-01-01T00:00:00.000Z","type":"string"}';
    const expected = slugOfCanonicalForm(canonical);
    const { slug, canonicalBytes } = productionSchemaSlugOf(fragment);
    expect(
      JSON.parse(canonicalBytes),
      `6g: a \`Date\`'s JSON representation is its \`toJSON\` result, so the bytes must parse ` +
        `back to the ISO string; observed ${canonicalBytes}`,
    ).toEqual({ default: "1970-01-01T00:00:00.000Z", type: "string" });
    expect(
      canonicalBytes,
      `6g: the canonical form is this file's hand-written ${canonical}; observed ${canonicalBytes}`,
    ).toBe(canonical);
    expect(
      slug,
      `6g: schema-subset.md:106–:107 — the slug is this file's own oracle slug over ` +
        `${canonical}, ${expected}; observed ${slug}`,
    ).toBe(expected);
    // The load-bearing claim. Reading the `Date`'s OWN properties instead of
    // its `toJSON` result renders `{}` — the same bytes an ordinary empty
    // object renders — so the PIC-11 byte-verify at
    // src/seams/schema-validator.ts:123 would pass on a cache hit and serve
    // the first schema's compiled validator for the second, with no
    // `validator-cache-collision` diagnostic to show for it.
    const sibling = productionSchemaSlugOf({ default: {}, type: "string" });
    expect(
      slug,
      `6g: two host schemas differing only in that value are two documents, so they must not ` +
        `share a slug; observed ${slug} vs ${sibling.slug}`,
    ).not.toBe(sibling.slug);
    expect(
      canonicalBytes,
      `6g: nor may they share canonical BYTES, or the byte-verify passes and the wrong cached ` +
        `validator is served silently; observed ${canonicalBytes} vs ${sibling.canonicalBytes}`,
    ).not.toBe(sibling.canonicalBytes);
  });

  it("6h: a boxed primitive canonicalises to the primitive it wraps, and does not collapse onto the empty object", () => {
    const fragment: LoweredSchema = { maximum: new Number(5) };
    const canonical = '{"maximum":5}';
    const expected = slugOfCanonicalForm(canonical);
    const { slug, canonicalBytes } = productionSchemaSlugOf(fragment);
    expect(
      JSON.parse(canonicalBytes),
      `6h: a \`Number\` wrapper's JSON representation is the number it wraps, so the bytes must ` +
        `parse back to \`{"maximum":5}\`; observed ${canonicalBytes}`,
    ).toEqual({ maximum: 5 });
    expect(
      canonicalBytes,
      `6h: the canonical form is this file's hand-written ${canonical}; observed ${canonicalBytes}`,
    ).toBe(canonical);
    expect(
      slug,
      `6h: schema-subset.md:106–:107 — the slug is this file's own oracle slug over ` +
        `${canonical}, ${expected}; observed ${slug}`,
    ).toBe(expected);
    const sibling = productionSchemaSlugOf({ maximum: {} });
    expect(
      slug,
      `6h: a wrapper read as an ordinary object renders \`{}\`, collapsing this schema onto ` +
        `\`{"maximum":{}}\`; the two are different documents; observed ${slug} vs ${sibling.slug}`,
    ).not.toBe(sibling.slug);
    expect(
      canonicalBytes,
      `6h: nor may the two share canonical BYTES; observed ${canonicalBytes} vs ` +
        `${sibling.canonicalBytes}`,
    ).not.toBe(sibling.canonicalBytes);
  });

  it("6i: a circular host schema is refused with a diagnosable `TypeError`, not stack exhaustion", () => {
    const circular: Record<string, unknown> = { type: "object" };
    circular.properties = { self: circular };
    let thrown: unknown;
    try {
      productionSchemaSlugOf(circular);
    } catch (error: unknown) {
      thrown = error;
    }
    expect(
      thrown,
      "6i: a circular structure has no JSON document to digest, so the slug computation must " +
        "refuse it rather than return; observed no throw",
    ).toBeInstanceOf(TypeError);
    expect(
      (thrown as Error).message,
      `6i: the refusal must NAME the circular structure so the failure is diagnosable at the ` +
        `dispatch site; a \`RangeError: Maximum call stack size exceeded\` from an unbounded ` +
        `walk names nothing; observed ${String((thrown as Error).message)}`,
    ).toMatch(/circular structure/i);
  });
});
