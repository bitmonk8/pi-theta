import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBinderEnvelopeSchema } from "../src/binder/binder-envelope";
import { renderBinderParamLine } from "../src/binder/binder-system-prompt";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0056 — theta has ONE type grammar and FOUR positions that lower a type
// expression to JSON Schema, and only three of them own a literal sublanguage
// (docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md).
//
//   - A `schema` body field type, a `schema X = …` alias/union right-hand side
//     and the `@<T>` annotation all enter `lowerTypeSource`
//     (src/parser/body-type-lowering.ts), whose FIRST act is the literal
//     sublanguage: `parseLiteralArm` over every `|` arm, then the settled
//     emission.
//   - The `params:` right-hand side enters `lowerParamsFieldType`
//     (src/parser/params.ts), which routes a non-brace-rooted source straight
//     to `lowerTypeExpr`. That function has no literal arm, so a literal falls
//     to its trailing catch-all and returns the permissive `{}`; an all-literal
//     union lowers each arm to `{}`, `classifyLoweredUnionArm` reads each as
//     non-primitive, and `lowerUnion` combines them into `{"anyOf":[{},{}]}`.
//
// WHAT THE ABSENT ARM COSTS. An empty schema matches every JSON value, so a
// param declared as one of two strings binds `7`, `null` or `{"nope":1}` at all
// three consumers of the lowered document — the binder envelope
// (`buildBinderEnvelopeSchema` → `relaxParamsSchema`, src/binder/binder-envelope.ts),
// the post-default-merge AJV compile and the subagent child's params intake
// (both src/extension/production-theta-producer.ts) — while the binder system
// prompt still renders the declared type verbatim (`renderBinderParamLine`,
// src/binder/binder-system-prompt.ts), so the model is grounded in a type the
// schema dropped. The gap does not close at depth: `hoistInlineObjectType`
// takes the caller's OWN per-field recursion and `lowerParamsFieldType` passes
// itself, so byte-identical inline-object source text lowers to two different
// fragments at the two hoisting positions and therefore mints two different
// `__inline_<slug>` names for one declaration.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schema-subset.md:79 — a literal `"foo"` / `42` / `true` /
//     `null` emits `{ "const": <value> }`. The row names `null` EXPLICITLY,
//     which is what settles the `null` position below.
//   - :80 — an enum or a string-literal union emits
//     `{ "type": "string", "enum": [...wire values...] }`. Bug 0055's fix
//     (0.59.0) landed this spelling at the three `lowerTypeSource` positions
//     with `type` written FIRST, and bug 0056 §Fix *Ordering* requires the
//     `params:` position to adopt it verbatim, key order included.
//   - :81 — SUBS-1 governs a union of `PrimitiveType` arms and scopes its
//     "treating `null` as a primitive" clause to THAT rule alone, so it does
//     not reach a `LiteralType` arm (grammar.md:102).
//   - :73 and :98 — the `__inline_<slug>` name is a function of the LOWERED
//     fragment, so two positions that lower one source text to one fragment
//     mint one name by construction. :100/:101/:104 and :107 are the canonical
//     form and 16-hex truncation the oracle below follows.
//   - docs/spec_topics/grammar.md:95 and :102 put `LiteralType` in `Type`;
//     :97 also lists `null` under `PrimitiveType`; :105 names "`params:` field
//     types" among the bare-`Type` positions and adds that "the grammar is
//     otherwise identical in every position"; :109 makes an inline object's
//     field `Type` recursive.
//   - docs/spec_topics/type-system.md:9 lists literal types as valid type
//     expressions; :15 — "The same type grammar applies in every
//     type-annotation position: schema fields, frontmatter `params:` …". One
//     grammar and one emission table give one answer per type expression.
//   - docs/spec_topics/schemas.md:93 — "For inline enumerations use
//     literal-union: `severity: "low" | "medium" | "high"`". The spec routes
//     authors into the form that stops constraining at `params:`.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:57 — "`params` are
//     validated with AJV at invocation time"; :58 — the right-hand side is "a
//     type expression parsed by the theta type grammar — the same grammar used
//     in every other type-annotation position".
//   - docs/spec_topics/binder/binder-bypass-and-envelope.md:117 (the
//     `Parameters:` block) and :129 (*Type display* — the surface type, never
//     the lowering), which group (f) holds unmoved.
//
// THE `null` ADJUDICATION (§Fix constraint 2), settled here for all four
// positions: `null` is a `LiteralType` for lowering purposes and the `params:`
// position adopts `{"const":null}`. schema-subset.md:79 names `null` among the
// literal row's own members while the primitive row (`{ "type": "<primitive>" }`)
// names none, and :81 scopes its null-as-primitive clause to the union rule; the
// three contrast positions already emit `{"const":null}`, so the losing position
// is `params:`. The two fragments admit exactly `null`, so what moves is bytes
// and slugs, never a verdict.
//
// PROBED CURRENT SIGNATURES (HEAD f856fd33 / 0.84.0, offline, deterministic).
// The bug doc's §Reproduction was written at 0.49.0 and its two BOOLEAN rows
// are STALE: bug 0044's fix (0.54.0) gave `lowerTypeExpr` its own `true` /
// `false` arm, so `p: 'true'` already loads with zero diagnostics and already
// lowers `{"const":true}` — it is NOT refused, and only the boolean UNION row
// moves. Every other row reproduces.
//
//   source              params: at HEAD                    the three contrast positions
//   "x" | "y"           {"anyOf":[{},{}]}                  {"type":"string","enum":["x","y"]}
//   "x"                 {}                                 {"const":"x"}
//   1 | 2               {"anyOf":[{},{}]}                  {"enum":[1,2]}
//   42                  {}                                 {"const":42}
//   "x" | null          {"anyOf":[{},{"type":"null"}]}      {"enum":["x",null]}
//   "x" | "y" | null    {"anyOf":[{},{},{"type":"null"}]}   {"enum":["x","y",null]}
//   null                {"type":"null"}                    {"const":null}
//   true                {"const":true}                     {"const":true}   (already agrees)
//   true | false        {"anyOf":[{"const":true},{"const":false}]}  {"enum":[true,false]}
//   {m: "x" | "y"}      $ref __inline_b5d5a13ca7926846     $ref __inline_cf9a345524fd2d87
//   {m: "x"}            $ref __inline_4b5ea26f0093b13c     $ref __inline_419c8179123a99b0
//   {m: null}           $ref __inline_168515c51f5e820f     $ref __inline_84af3dd41af27d3e
//   {m: {n: "x"|"y"}}   $ref __inline_438f9e4c9fffd394     $ref __inline_b29de9705c9f6fd4
//                       over __inline_829bfb0636444915     over __inline_5e132cb3f692fe5a
//   AJV over the lowered `params:` document for `p: '"x" | "y"'`: all nine
//   probed payloads ACCEPTED, including `"zzz"`, `7`, `null` and `{"nope":1}`.
//   The binder envelope's `ok.args.properties.p` carries `{"anyOf":[{},{}]}`
//   while the `Parameters:` line renders `  p ("x" | "y") required`.
//
// WHAT IS RED HERE: every cell of groups (a), (b), (c) and (f)'s envelope
// assertion, plus group (e)'s boolean-union cell. Group (d) (the controls the
// literal recogniser declines) and group (e)'s single-boolean cell are green
// now and must stay green byte-for-byte: they are what keeps the fix from
// over-reaching into §Non-goals — a mixed union, a literal union inside a
// generic argument, `T | null` for non-literal `T`, and every primitive, named
// type, `array<T>` and non-literal inline object.
// THREE OF GROUP (d)'s ROWS LATER MOVED UNDER LATER REPORTS, each keeping its
// subject and its four-position scope while its pinned bytes were re-derived:
//   - `d4` (`"x" | integer`) and `d5` (`"x" | Triage`) under bug 0184 §Fix,
//     which routes the union-ARM recursion through this same literal
//     sublanguage (gated to the MIXED arm set), so each literal ARM lowers
//     `{"const":…}`. Bug 0056 §Non-goals' own reading — that the WHOLE-SOURCE
//     check declines a mixed union — is unchanged and is still why those rows
//     exist; what moved is the ARM's disposition.
//   - `d6` (`array<"x" | "y">`) under bug 0164 §Fix (v0.123.0), which routes
//     `lowerTypeExpr`'s GENERIC-ARGUMENT recursion through the same
//     sublanguage, so the argument reaches schema-subset.md:80's emission
//     inside :77's `items`. Bug 0056 §Non-goals' reading of THIS row — that
//     `lowerTypeExpr` recurses a generic's argument through itself, so the
//     element type reaches no literal check anywhere — is what that fix
//     changed: the MECHANISM this row's message described is the mechanism
//     bug 0164 §Fix removed, at the argument and at every position at once.
// `d1`–`d3` (the `null` idiom, which bug 0184 §Fix constraint 5 protects by
// testing `PRIMITIVE_TYPES` first) and `d7`–`d9` (a primitive, `array<string>`
// and a named type — all three declined by the recogniser) stay byte-frozen.
//
// THE SLUG ORACLE IS INDEPENDENT. `schemaSlug` (src/parser/schema-lowering.ts)
// is deliberately NOT imported: an oracle taken from the implementation under
// test proves nothing. Each `__inline_<slug>` expected below is derived from a
// HAND-WRITTEN canonical-form string following schema-subset.md §Canonical
// schema hash, hashed with `node:crypto`, and group (0) keeps those strings
// honest by parse-back equality against the fragment each claims to serialise
// plus a whitespace and key-sort check.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` or `lowerQueryResponseSchema` call over a string,
// plus one real AJV compile through the shipped `AjvSchemaValidator` seam. An
// integration or live tier could not observe the subject at all: the claim is
// about the exact bytes at a lowering boundary and about the 16-hex slug hashed
// from them, both fully determined before any turn runs, and a provider
// round-trip would add stochastic surface over a contract that has none.
//
// NO SILENT SKIPPING: every driver asserts the fixture's diagnostic list is
// empty and then throws, naming the absent intermediate, when the lowered
// document, the `$defs` entry or the lowered annotation is missing. A refused
// parse can never be mistaken for a pass.

// ===========================================================================
// The settled emissions, and the independent `__inline_<slug>` oracle.
// ===========================================================================

/**
 * `"x" | "y"` under schema-subset.md:80: the wire values enumerated, `type`
 * written FIRST.
 */
const XY_ENUM = { type: "string", enum: ["x", "y"] };

/**
 * The key order schema-subset.md:80 spells, which `respondSchemaSlug`
 * (src/runtime/typed-query-validation.ts) and the `__inline_<slug>` mint both
 * hash.
 */
const XY_ENUM_KEY_ORDER = ["type", "enum"];

/** `{m: "x" | "y"}` — one field carrying the string-literal-union emission. */
const M_XY_FRAGMENT = {
  type: "object",
  properties: { m: XY_ENUM },
  required: ["m"],
  additionalProperties: false,
};

/** `{m: "x"}` — one field carrying schema-subset.md:79's single-literal emission. */
const M_CONST_FRAGMENT = {
  type: "object",
  properties: { m: { const: "x" } },
  required: ["m"],
  additionalProperties: false,
};

/** `{m: null}` — the constraint-2 adjudication one level down. */
const M_NULL_FRAGMENT = {
  type: "object",
  properties: { m: { const: null } },
  required: ["m"],
  additionalProperties: false,
};

/** `{n: "x" | "y"}` — the INNER fragment of the twice-nested form. */
const N_XY_FRAGMENT = {
  type: "object",
  properties: { n: XY_ENUM },
  required: ["n"],
  additionalProperties: false,
};

/** `{m: integer}` — the non-literal control whose slug must not move. */
const M_INTEGER_FRAGMENT = {
  type: "object",
  properties: { m: { type: "integer" } },
  required: ["m"],
  additionalProperties: false,
};

/**
 * Each fragment's canonical form (schema-subset.md:100/:101/:104): object keys
 * sorted by Unicode code point at every level, array elements left in lowering
 * order, no insignificant whitespace. Written by hand so the expected slugs are
 * not read off the implementation that mints them.
 */
const M_XY_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"enum":["x","y"],"type":"string"}},' +
  '"required":["m"],"type":"object"}';
const M_CONST_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"const":"x"}},"required":["m"],"type":"object"}';
const M_NULL_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"const":null}},"required":["m"],"type":"object"}';
const N_XY_CANONICAL =
  '{"additionalProperties":false,"properties":{"n":{"enum":["x","y"],"type":"string"}},' +
  '"required":["n"],"type":"object"}';
const M_INTEGER_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"type":"integer"}},"required":["m"],' +
  '"type":"object"}';

/**
 * SHA-256 of the canonical-form bytes, first 16 lowercase hex characters
 * (schema-subset.md:106 — the digest, :107 — the truncation).
 */
function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/**
 * The synthesised `$defs` key for a fragment given its canonical form
 * (schema-subset.md:73, and :108 for the reserved `__inline_<slug>` form).
 */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}

const M_XY_INLINE = inlineDefName(M_XY_CANONICAL);
const M_CONST_INLINE = inlineDefName(M_CONST_CANONICAL);
const M_NULL_INLINE = inlineDefName(M_NULL_CANONICAL);
const N_XY_INLINE = inlineDefName(N_XY_CANONICAL);
const M_INTEGER_INLINE = inlineDefName(M_INTEGER_CANONICAL);

/**
 * The OUTER fragment of `{m: {n: "x" | "y"}}` and its canonical form. The outer
 * fragment's `m` is the `$ref` naming the inner mint, so the outer slug is a
 * function of the inner one — the property that makes the twice-nested row the
 * sharpest test of the collapse.
 */
const M_N_XY_FRAGMENT = {
  type: "object",
  properties: { m: { $ref: `#/$defs/${N_XY_INLINE}` } },
  required: ["m"],
  additionalProperties: false,
};
const M_N_XY_CANONICAL =
  `{"additionalProperties":false,"properties":{"m":{"$ref":"#/$defs/${N_XY_INLINE}"}},` +
  '"required":["m"],"type":"object"}';
const M_N_XY_INLINE = inlineDefName(M_N_XY_CANONICAL);

// ===========================================================================
// The four `Type` positions, and the loud drivers that read them.
// ===========================================================================

/** The one declared type every control that names a schema resolves against. */
const DECLS = "schema Triage { urgent: boolean }\n";

/** The closed lowering of `schema Triage { urgent: boolean }`. */
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};

const POSITIONS = ["params", "field", "alias", "annotation"] as const;
type Position = (typeof POSITIONS)[number];

/** The three positions that hoist an inline object under a minted `$defs` name. */
const HOISTING_POSITIONS = ["params", "field", "alias"] as const;

/**
 * A theta-side literal carries theta-side quotes, so a `params:` entry wraps the
 * whole type expression in a YAML single-quoted scalar. The unquoted spelling
 * is not valid YAML and collapses the load to `theta/load/missing-mode` (bug
 * 0056 §Reproduction *Spelling*), which is a different frame.
 */
function yamlQuoted(typeSource: string): string {
  return `'${typeSource.replace(/'/g, "''")}'`;
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function loweredParamsDocument(doc: ThetaDocument): Record<string, unknown> | undefined {
  return doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined;
}

/** What one `Type` position yields for one type source. */
interface PositionRead {
  /** Every diagnostic the whole-document load raised, rendered. */
  readonly diags: readonly string[];
  /** The fragment AT the type position, absent when the load produced none. */
  readonly fragment?: unknown;
  /** The whole lowered document, for the `$ref`-closure and AJV checks. */
  readonly document?: LoweredSchema;
  /** The document's `$defs`, with the position's own wrapper name removed. */
  readonly defs: Record<string, unknown>;
}

/**
 * Read one type source at one of the four positions. Never throws on a refused
 * load — the caller decides whether an absent fragment is the subject or a
 * broken fixture, and `fragmentOf` below is the loud reader.
 *
 * The `@<T>` annotation returns its lowered document AS the fragment, so its
 * root `$defs` closure is split off to keep the four positions comparable: at
 * the other three the closure lives on the enclosing `params:` document, never
 * on the fragment.
 */
function readAt(position: Position, typeSource: string): PositionRead {
  if (position === "annotation") {
    const doc = parseDoc(`---\nmode: prompt\n---\n${DECLS}let inert = 1\ninert\n`, "bug0056.theta");
    const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
    const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
    const lowered = lowerQueryResponseSchema(typeSource, schemas, enums);
    if (lowered === undefined) {
      return { diags: diagLines(doc), defs: {} };
    }
    const { $defs, ...root } = lowered as Record<string, unknown>;
    return {
      diags: diagLines(doc),
      fragment: root,
      document: lowered,
      defs: ($defs ?? {}) as Record<string, unknown>,
    };
  }
  const source =
    position === "params"
      ? `---\nmode: prompt\nparams:\n  p: ${yamlQuoted(typeSource)}\n---\n${DECLS}let inert = 1\ninert\n`
      : position === "field"
        ? `---\nmode: prompt\nparams:\n  p: S\n---\n${DECLS}schema S { a: ${typeSource} }\nlet inert = 1\ninert\n`
        : `---\nmode: prompt\nparams:\n  a: M\n---\n${DECLS}schema M = ${typeSource}\nlet inert = 1\ninert\n`;
  const doc = parseDoc(source, "bug0056.theta");
  const document = loweredParamsDocument(doc);
  const defs = { ...((document?.["$defs"] ?? {}) as Record<string, unknown>) };
  const wrapper = position === "field" ? "S" : position === "alias" ? "M" : undefined;
  let fragment: unknown;
  if (document !== undefined) {
    if (position === "params") {
      fragment = (document["properties"] as Record<string, unknown>)["p"];
    } else if (position === "field") {
      const s = defs["S"] as Record<string, unknown> | undefined;
      fragment = (s?.["properties"] as Record<string, unknown> | undefined)?.["a"];
    } else {
      fragment = defs["M"];
    }
  }
  if (wrapper !== undefined) {
    // The wrapper `$defs` entry is the position's own scaffolding, not a name
    // the type source reached, so it is dropped to keep the minted-name
    // comparisons across positions like-for-like.
    delete defs[wrapper];
  }
  return {
    diags: diagLines(doc),
    ...(document !== undefined ? { fragment, document: document as LoweredSchema } : {}),
    defs,
  };
}

/**
 * The fragment at one position, loud on every way a fixture can fail to reach
 * the lowering: a diagnostic (which withholds the whole lowered document at the
 * `params:` positions) or an absent document.
 */
function fragmentOf(label: string, position: Position, typeSource: string): unknown {
  const read = readAt(position, typeSource);
  expect(
    read.diags,
    `${label} [${position}]: \`${typeSource}\` is grammar-admitted at every type-annotation ` +
      `position (grammar.md:105, type-system.md:15), so this fixture must load with NO ` +
      `diagnostics or the lowering under assertion never runs; observed ` +
      `${JSON.stringify(read.diags)}`,
  ).toEqual([]);
  if (read.document === undefined) {
    throw new Error(
      `${label} [${position}]: \`${typeSource}\` produced NO lowered document, so there is ` +
        `nothing for AJV to enforce at that position; diagnostics ${JSON.stringify(read.diags)}`,
    );
  }
  return read.fragment;
}

/** The `$defs` entry a hoisting position minted, never absent. */
function defOf(
  label: string,
  position: Position,
  typeSource: string,
  name: string,
): Record<string, unknown> {
  const read = readAt(position, typeSource);
  const entry = read.defs[name];
  if (entry === undefined) {
    throw new Error(
      `${label} [${position}]: \`${typeSource}\` must hoist under \`${name}\` — the name ` +
        `schema-subset.md:73 mints from the LOWERED fragment — or the \`$ref\` at the type ` +
        `position dangles; observed \`$defs\` keys ${JSON.stringify(Object.keys(read.defs))}`,
    );
  }
  return entry as Record<string, unknown>;
}

/** The def name a hoisting position's `$ref` points at, loud on a non-`$ref`. */
function refNameOf(label: string, position: Position, typeSource: string): string {
  const fragment = fragmentOf(label, position, typeSource) as Record<string, unknown>;
  const ref = fragment["$ref"];
  if (typeof ref !== "string") {
    throw new Error(
      `${label} [${position}]: a brace-rooted \`${typeSource}\` hoists (schema-subset.md:73), ` +
        `so the fragment at the position is a \`$ref\`; observed ${JSON.stringify(fragment)}`,
    );
  }
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (match?.[1] === undefined) {
    throw new Error(`${label} [${position}]: unreadable \`$ref\` pointer ${JSON.stringify(ref)}`);
  }
  return match[1];
}

/** The whole lowered `params:` document of a theta that MUST load. */
function paramsDocument(label: string, typeSource: string): LoweredSchema {
  const read = readAt("params", typeSource);
  expect(
    read.diags,
    `${label}: \`${typeSource}\` is legal theta at the \`params:\` position ` +
      `(frontmatter-fields-a.md:58), so this fixture must load with NO diagnostics; observed ` +
      `${JSON.stringify(read.diags)}`,
  ).toEqual([]);
  if (read.document === undefined) {
    throw new Error(
      `${label}: the theta declares a \`params:\` block, so its lowered schema must be present ` +
        `(BIND-1); diagnostics ${JSON.stringify(read.diags)}`,
    );
  }
  return read.document;
}

/** The real AJV seam — `strict: false`, `allErrors: true`, the shipped validator. */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

// ===========================================================================
// (0) The slug oracle's own honesty — each hand-written canonical form must be
// the fragment it claims to serialise, in canonical form.
// ===========================================================================

const CANONICAL_PAIRS: ReadonlyArray<readonly [string, string, unknown]> = [
  ['{m: "x" | "y"}', M_XY_CANONICAL, M_XY_FRAGMENT],
  ['{m: "x"}', M_CONST_CANONICAL, M_CONST_FRAGMENT],
  ["{m: null}", M_NULL_CANONICAL, M_NULL_FRAGMENT],
  ['{n: "x" | "y"}', N_XY_CANONICAL, N_XY_FRAGMENT],
  ['{m: {n: "x" | "y"}}', M_N_XY_CANONICAL, M_N_XY_FRAGMENT],
  ["{m: integer}", M_INTEGER_CANONICAL, M_INTEGER_FRAGMENT],
];

describe("bug 0056 (0) — the independent `__inline_<slug>` oracle", () => {
  for (const [label, canonical, fragment] of CANONICAL_PAIRS) {
    it(`CONTROL (o1, ${label}): the hand-written canonical form parses back to the fragment it names`, () => {
      expect(
        JSON.parse(canonical),
        `schema-subset.md:98 hashes the LOWERED fragment, so the oracle's canonical string must ` +
          `carry exactly that value and no other; observed ${canonical}`,
      ).toEqual(fragment);
    });

    it(`CONTROL (o2, ${label}): the canonical form sorts every object's keys and carries no insignificant whitespace`, () => {
      expect(
        canonical,
        `schema-subset.md:101 — no space or newline between tokens; observed ${canonical}`,
      ).toBe(JSON.stringify(JSON.parse(canonical)));
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
        canonical,
        `schema-subset.md:100 — object keys sorted by Unicode code point at every level; :104 — ` +
          `array elements left in lowering order; observed ${canonical}`,
      ).toBe(JSON.stringify(sorted(fragment)));
    });
  }
});

// ===========================================================================
// (a) FOUR-POSITION BYTE PARITY over the whole constraint-1 class of scalar
// sources. One grammar (type-system.md:15) and one emission table
// (schema-subset.md step 3) give one answer per type expression.
// RED at HEAD: the `params:` column of every row but `true`.
// ===========================================================================

/**
 * Each constraint-1 scalar source, its disposition at HEAD, the one fragment
 * all four positions owe it, and the rule that owes it. `CONTROL` marks the one
 * row the `params:` position already agrees on.
 */
const PARITY_ROWS: ReadonlyArray<readonly [string, string, string, unknown, string]> = [
  [
    "RED",
    "a1",
    '"x" | "y"',
    XY_ENUM,
    "schema-subset.md:80 — an all-string-literal union, in the spelling bug 0055's fix landed",
  ],
  ["RED", "a2", '"x"', { const: "x" }, "schema-subset.md:79 — a single string literal"],
  [
    "RED",
    "a3",
    "1 | 2",
    { enum: [1, 2] },
    "schema-subset.md:80 with no `type`: :80 spells `\"string\"` for the enum or STRING-literal " +
      "union, and `{\"type\":\"string\"}` would refuse every value `1 | 2` declares",
  ],
  ["RED", "a4", "42", { const: 42 }, "schema-subset.md:79 — a single number literal"],
  [
    "RED",
    "a5",
    '"x" | null',
    { enum: ["x", null] },
    "schema-subset.md:79 names `null` among the literal row's own members, so a union carrying " +
      "it is all-literal and takes :80's bare `enum` (the values are not all strings)",
  ],
  [
    "RED",
    "a6",
    '"x" | "y" | null',
    { enum: ["x", "y", null] },
    "the same rule at three arms, with :85 (*Array element order*) fixing source order",
  ],
  [
    "RED",
    "a7",
    "null",
    { const: null },
    "bug 0056 §Fix constraint 2, adjudicated for all four positions: schema-subset.md:79 names " +
      "`null` EXPLICITLY in the literal row while the primitive row names no member, and :81 " +
      "scopes its null-as-primitive clause to the UNION rule alone",
  ],
  [
    "CONTROL",
    "a8",
    "true",
    { const: true },
    "schema-subset.md:79 — a single boolean literal. This row already AGREES at HEAD: bug 0044's " +
      "fix (0.54.0) gave `lowerTypeExpr` its own `true` / `false` arm, so it is a no-op control " +
      "on the `params:` side and a parity pin on the others",
  ],
  [
    "RED",
    "a9",
    "true | false",
    { enum: [true, false] },
    "schema-subset.md:80's bare `enum` for a non-string literal union — the boolean row that DOES " +
      "move, because bug 0044's arm lowers each atom independently and `lowerUnion` then combines " +
      "two `{\"const\":…}` arms into an `anyOf`",
  ],
];

describe("bug 0056 (a) — one type expression, one fragment, at all four positions", () => {
  for (const [disposition, cell, source, expected, why] of PARITY_ROWS) {
    it(`${disposition} (${cell}): \`${source}\` lowers ${JSON.stringify(expected)} at every position`, () => {
      for (const position of POSITIONS) {
        const fragment = fragmentOf(cell, position, source);
        expect(
          fragment,
          `${cell} [${position}]: ${why}; observed ${JSON.stringify(fragment)}`,
        ).toEqual(expected);
      }
    });
  }

  it("RED (a10): the string-literal union's KEY ORDER is `type` then `enum` at every position", () => {
    // `toEqual` cannot see key order, and order is contractual here:
    // `respondSchemaSlug` (src/runtime/typed-query-validation.ts) hashes
    // `JSON.stringify(lowered)`, so a `params:` position that agreed on the
    // key SET and disagreed on the order would mint a different respond-tool
    // name and a different `__inline_<slug>` for one declared value set —
    // exactly the split bug 0055's fix collapsed at the other three positions.
    for (const position of POSITIONS) {
      const fragment = fragmentOf("a10", position, '"x" | "y"') as Record<string, unknown>;
      expect(
        Object.keys(fragment),
        `a10 [${position}]: schema-subset.md:80 spells \`{ "type": "string", "enum": [...] }\` ` +
          `with \`type\` FIRST, and bug 0056 §Fix's 0.59.0 addendum makes that order part of the ` +
          `emission the shared helper carries verbatim; observed ${JSON.stringify(fragment)}`,
      ).toEqual(XY_ENUM_KEY_ORDER);
    }
  });

  it("RED (a11): the four positions agree BYTE for byte, not merely value for value", () => {
    for (const [, cell, source] of PARITY_ROWS) {
      const rendered = POSITIONS.map(
        (position) => [position, JSON.stringify(fragmentOf(cell, position, source))] as const,
      );
      const reference = rendered[0]?.[1];
      for (const [position, bytes] of rendered) {
        expect(
          bytes,
          `${cell} [${position}]: type-system.md:15 gives one grammar per position and ` +
            `schema-subset.md step 3 one emission per type form, so \`${source}\` has ONE byte ` +
            `sequence; rendered ${JSON.stringify(rendered)}`,
        ).toBe(reference);
      }
    }
  });
});

// ===========================================================================
// (b) DEPTH AND THE SLUG COLLAPSE — `lowerParamsFieldType` is also the per-field
// recursion it hands to `hoistInlineObjectType`, so the literal check reaches
// every nesting depth for free, and the two hoisting positions stop minting two
// names for one source text (schema-subset.md:73/:98).
// RED at HEAD: the `params:` position mints its own name over a permissive `m`.
// ===========================================================================

describe("bug 0056 (b) — a nested literal lowers alike, so one source text mints one name", () => {
  const NESTED_ROWS: ReadonlyArray<readonly [string, string, string, unknown, string]> = [
    [
      "b1",
      '{m: "x" | "y"}',
      M_XY_INLINE,
      M_XY_FRAGMENT,
      "grammar.md:109 makes an inline object's field `Type` recursive, so the field's own type " +
        "takes schema-subset.md:80 exactly as a top-level one does",
    ],
    [
      "b2",
      '{m: "x"}',
      M_CONST_INLINE,
      M_CONST_FRAGMENT,
      "schema-subset.md:79 one level down",
    ],
    [
      "b3",
      "{m: null}",
      M_NULL_INLINE,
      M_NULL_FRAGMENT,
      "bug 0056 §Fix constraint 2's adjudication one level down: `null` is a `LiteralType` at " +
        "every position and every depth",
    ],
  ];

  for (const [cell, source, name, fragment, why] of NESTED_ROWS) {
    it(`RED (${cell}): \`${source}\` hoists ${name} at the \`params:\`, \`schema\`-body and alias positions`, () => {
      const minted = HOISTING_POSITIONS.map(
        (position) => [position, refNameOf(cell, position, source)] as const,
      );
      for (const [position, mintedName] of minted) {
        expect(
          mintedName,
          `${cell} [${position}]: schema-subset.md:73 collapses two inline schemas to ONE ` +
            `\`$defs\` entry exactly when their lowered fragments are byte-identical, and :98 ` +
            `makes the name a function of that fragment — so one source text has one name; ` +
            `minted ${JSON.stringify(minted)}`,
        ).toBe(name);
        const entry = defOf(cell, position, source, name);
        expect(
          entry,
          `${cell} [${position}]: ${why}; observed ${JSON.stringify(entry)}`,
        ).toEqual(fragment);
      }
      // The `@<T>` annotation root is brace-rooted, so it lowers the object in
      // place rather than hoisting it; the content is the same fragment, which
      // is what makes the minted name above derivable from it.
      expect(
        fragmentOf(cell, "annotation", source),
        `${cell} [annotation]: the annotation root inlines what the other three positions hoist, ` +
          `so its bytes are the mint's input`,
      ).toEqual(fragment);
    });
  }

  it("RED (b4): the twice-nested `{m: {n: \"x\" | \"y\"}}` collapses at BOTH levels", () => {
    // The outer fragment's `m` is the `$ref` naming the inner mint, so the
    // outer slug is a function of the inner one: a `params:` position that
    // healed only the leaf would still mint a different outer name.
    const source = '{m: {n: "x" | "y"}}';
    for (const position of HOISTING_POSITIONS) {
      expect(
        refNameOf("b4", position, source),
        `b4 [${position}]: the OUTER mint, whose canonical form embeds the inner name`,
      ).toBe(M_N_XY_INLINE);
      expect(
        defOf("b4", position, source, M_N_XY_INLINE),
        `b4 [${position}]: schema-subset.md:73 — the outer entry points at the inner mint`,
      ).toEqual(M_N_XY_FRAGMENT);
      expect(
        defOf("b4", position, source, N_XY_INLINE),
        `b4 [${position}]: the INNER entry carries :80's emission two levels down, which is what ` +
          `\`lowerParamsFieldType\` recursing into ITSELF now delivers for free`,
      ).toEqual(N_XY_FRAGMENT);
    }
    const annotation = readAt("annotation", source);
    expect(
      annotation.fragment,
      "b4 [annotation]: the root inlines, and its `m` names the same inner mint",
    ).toEqual(M_N_XY_FRAGMENT);
    expect(
      annotation.defs,
      "b4 [annotation]: the annotation document's own `$defs` closure carries the inner entry",
    ).toEqual({ [N_XY_INLINE]: N_XY_FRAGMENT });
  });

  it("RED (b5): a nested integer literal and a nested decimal literal each hoist one name at the `params:`, `schema`-body and alias positions, on both sides of `toLoweredJsonValue`'s number-kind split", () => {
    // `hoistInlineObjectType` hashes a hoisted fragment through
    // `toLoweredJsonValue`, whose `Number.isInteger` ternary renders an
    // integer-valued number `"integer"` and any other number `"number"`
    // ahead of the canonical-hash recipe's own numeric rendering
    // (schema-subset.md:102 — the recipe is explicitly number-kind-sensitive).
    // A `params:` inline object field carrying a numeric literal reaches that
    // ternary through `lowerLiteralSublanguage`'s `const` emission (bug 0056
    // §Fix): `{m: 42}` and `{m: 1.5}` are both brace-rooted, so
    // `lowerParamsFieldType` falls to `hoistInlineObjectType`, whose per-field
    // recursion is `lowerParamsFieldType` itself — resolving `m`'s own type to
    // a `const` before this hoist hashes the fragment. One row alone would
    // exercise only one arm of the ternary; this cell carries both.
    const INTEGER_SOURCE = "{m: 42}";
    const INTEGER_CANONICAL =
      '{"additionalProperties":false,"properties":{"m":{"const":42}},"required":["m"],' +
      '"type":"object"}';
    const INTEGER_FRAGMENT = {
      type: "object",
      properties: { m: { const: 42 } },
      required: ["m"],
      additionalProperties: false,
    };
    const INTEGER_INLINE = inlineDefName(INTEGER_CANONICAL);

    const DECIMAL_SOURCE = "{m: 1.5}";
    const DECIMAL_CANONICAL =
      '{"additionalProperties":false,"properties":{"m":{"const":1.5}},"required":["m"],' +
      '"type":"object"}';
    const DECIMAL_FRAGMENT = {
      type: "object",
      properties: { m: { const: 1.5 } },
      required: ["m"],
      additionalProperties: false,
    };
    const DECIMAL_INLINE = inlineDefName(DECIMAL_CANONICAL);

    const SPLIT_ROWS: ReadonlyArray<readonly [string, string, string, unknown]> = [
      ["integer", INTEGER_SOURCE, INTEGER_INLINE, INTEGER_FRAGMENT],
      ["decimal", DECIMAL_SOURCE, DECIMAL_INLINE, DECIMAL_FRAGMENT],
    ];

    for (const [side, source, name, fragment] of SPLIT_ROWS) {
      for (const position of HOISTING_POSITIONS) {
        const mintedName = refNameOf("b5", position, source);
        expect(
          mintedName,
          `b5 [${side}/${position}]: schema-subset.md:73 collapses two inline schemas to ONE ` +
            `\`$defs\` entry exactly when their lowered fragments are byte-identical, and :98 ` +
            `makes the name a function of that fragment — so one source text has one name; ` +
            `minted ${mintedName}`,
        ).toBe(name);
        const entry = defOf("b5", position, source, name);
        expect(
          entry,
          `b5 [${side}/${position}]: the hoisted fragment carries the \`const\` this literal ` +
            `lowers to; observed ${JSON.stringify(entry)}`,
        ).toEqual(fragment);
      }
      // The `@<T>` annotation root is brace-rooted, so it lowers the object in
      // place rather than hoisting it; the content is the same fragment, which
      // is what makes the minted name above derivable from it.
      const annotationFragment = fragmentOf("b5", "annotation", source);
      expect(
        annotationFragment,
        `b5 [${side}/annotation]: the annotation root inlines what the other three positions ` +
          `hoist, so its bytes are the mint's input; observed ${JSON.stringify(annotationFragment)}`,
      ).toEqual(fragment);
    }
  });
});

// ===========================================================================
// (c) REAL AJV over the lowered `params:` document — the lowered fragment is the
// only enforcement the argument gets (frontmatter-fields-a.md:57).
// RED at HEAD: every refused payload below is accepted.
// ===========================================================================

describe("bug 0056 (c) — the production validator over the lowered `params:` document", () => {
  /** The nine payloads of the bug doc's §Reproduction AJV table, at `p`. */
  const FLAT_PAYLOADS: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ['"x"', "x", true],
    ['"y"', "y", true],
    ['"zzz"', "zzz", false],
    ['""', "", false],
    ["7", 7, false],
    ["true", true, false],
    ["[]", [], false],
    ['{"nope":1}', { nope: 1 }, false],
    ["null", null, false],
  ];

  it("RED (c1): `p: '\"x\" | \"y\"'` admits the two declared arms and refuses everything else", () => {
    const document = paramsDocument("c1", '"x" | "y"');
    const compiled = ajv().compile(document);
    for (const [label, value, admitted] of FLAT_PAYLOADS) {
      const result = compiled.validate({ p: value });
      expect(
        result.ok,
        `c1: schema-subset.md:80 closes the value set to the two arms the author declared, and ` +
          `frontmatter-fields-a.md:57 makes AJV the enforcement, so \`{"p":${label}}\` must be ` +
          `${admitted ? "ACCEPTED" : "REFUSED"} against ${JSON.stringify(document)}; observed ` +
          `${JSON.stringify(result)}`,
      ).toBe(admitted);
    }
  });

  it("RED (c2): the nested route through the hoisted `$ref` enforces at depth", () => {
    const document = paramsDocument("c2", '{m: "x" | "y"}');
    const compiled = ajv().compile(document);
    for (const [label, value, admitted] of [
      ['{"m":"x"}', { m: "x" }, true],
      ['{"m":"zzz"}', { m: "zzz" }, false],
      ['{"m":7}', { m: 7 }, false],
      ['{"m":null}', { m: null }, false],
    ] as const) {
      const result = compiled.validate({ p: value });
      expect(
        result.ok,
        `c2: the hoisted \`$defs\` entry is what the field's \`$ref\` resolves against, so the ` +
          `depth-1 literal constrains the same way the top-level one does; \`{"p":${label}}\` ` +
          `must be ${admitted ? "ACCEPTED" : "REFUSED"} against ${JSON.stringify(document)}; ` +
          `observed ${JSON.stringify(result)}`,
      ).toBe(admitted);
    }
  });

  it("CONTROL (c3): the named-alias route already enforces, and does not move", () => {
    // The two spellings of one declaration must agree: `schema Sev = "x" | "y"`
    // with `p: Sev` refuses `"zzz"` at HEAD, which is the observable the inline
    // spelling is missing. Pinned so the fix is measured against a route that
    // already works rather than against itself.
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n  p: Sev\n---\nschema Sev = "x" | "y"\nlet inert = 1\ninert\n`,
      "bug0056.theta",
    );
    expect(diagLines(doc), "c3: the alias fixture must load clean").toEqual([]);
    const document = loweredParamsDocument(doc);
    if (document === undefined) {
      throw new Error("c3: the alias fixture declares a `params:` block, so BIND-1 requires a lowered schema");
    }
    const compiled = ajv().compile(document as LoweredSchema);
    for (const [label, value, admitted] of [
      ['"x"', "x", true],
      ['"zzz"', "zzz", false],
      ["7", 7, false],
    ] as const) {
      expect(
        compiled.validate({ p: value }).ok,
        `c3: the named route lowers \`{"$ref":"#/$defs/Sev"}\` against an enforcing \`$defs\` ` +
          `entry; \`{"p":${label}}\` must be ${admitted ? "ACCEPTED" : "REFUSED"} against ` +
          `${JSON.stringify(document)}`,
      ).toBe(admitted);
    }
  });
});

// ===========================================================================
// (d) THE NO-OP CONTROLS (§Fix constraint 1 "Nothing else moves", §Non-goals) —
// a source with any non-literal arm fails the all-arms test and reaches
// `lowerTypeExpr` exactly as today. GREEN at HEAD and required to stay green:
// these are what keeps the fix from over-reaching.
// ===========================================================================

describe("bug 0056 (d) — every source the literal recogniser declines keeps its bytes, except d4/d5 (bug 0184 §Fix) and d6 (bug 0164 §Fix)", () => {
  /** Each control, its pinned fragment, and the positions it is comparable at. */
  const CONTROLS: ReadonlyArray<readonly [string, string, unknown, readonly Position[], string]> = [
    [
      "d1",
      "string | null",
      { type: ["string", "null"] },
      POSITIONS,
      "the nullability idiom has a non-literal arm, so it never enters a literal check and takes " +
        "SUBS-1's multi-type-array form (schema-subset.md:81)",
    ],
    ["d2", "integer | null", { type: ["integer", "null"] }, POSITIONS, "the same idiom, numeric"],
    [
      "d3",
      "Triage | null",
      { anyOf: [{ $ref: "#/$defs/Triage" }, { type: "null" }] },
      POSITIONS,
      "a named arm is non-primitive, so SUBS-1 forces `anyOf` (schema-subset.md:81)",
    ],
    [
      "d4",
      '"x" | integer',
      { anyOf: [{ const: "x" }, { type: "integer" }] },
      POSITIONS,
      "bug 0043 §Non-goals held the MIXED union and bug 0056 §Non-goals left it there — the " +
        "all-arms-literal test declines a union carrying a non-literal arm at every position, so " +
        "the whole source goes to `lowerTypeExpr`, whose per-arm recursion re-enters ITSELF and " +
        "owns no literal rule. THE MECHANISM IS UNCHANGED AND THE DISPOSITION IS NOT: bug 0184 " +
        "§Fix routes the union-ARM recursion through the same literal sublanguage (gated to the " +
        "MIXED arm set), so `\"x\"` lowers schema-subset.md:79's `{ \"const\": \"x\" }` at the arm " +
        "while `integer` keeps its primitive `{\"type\":\"integer\"}`. Bug 0184 §Fix is the " +
        "authority that moved these bytes; this cell keeps its subject, the four-position parity",
    ],
    [
      "d5",
      '"x" | Triage',
      { anyOf: [{ const: "x" }, { $ref: "#/$defs/Triage" }] },
      POSITIONS,
      "the same mixed-union rule with a named arm, and the same lift: bug 0184 §Fix gives the " +
        "literal arm schema-subset.md:79's `const` while the named arm keeps resolving to its own " +
        "`$defs` entry",
    ],
    [
      "d6",
      'array<"x" | "y">',
      { type: "array", items: { type: "string", enum: ["x", "y"] } },
      POSITIONS,
      "bug 0056 §Non-goals read this row as `lowerTypeExpr` recursing a generic's argument " +
        "through ITSELF at every position, so the element type reached no literal check " +
        "anywhere — and stated that routing it back was a change to that recursion and not this " +
        "fix. THAT MECHANISM IS WHAT CHANGED: bug 0164 §Fix (v0.123.0) routes the " +
        "generic-argument recursion through the same `lowerLiteralSublanguage` this file's " +
        "`params:` position consults at the top of a type source, so the argument reaches " +
        "schema-subset.md:80's `{\"type\":\"string\",\"enum\":[…]}` inside :77's `items`. Bug 0164 " +
        "§Fix is the authority that moved these bytes; this cell keeps its subject, the " +
        "four-position parity of a literal union nested one generic deep",
    ],
    ["d7", "string", { type: "string" }, POSITIONS, "schema-subset.md:75 — a primitive"],
    [
      "d8",
      "array<string>",
      { type: "array", items: { type: "string" } },
      POSITIONS,
      "schema-subset.md:77 — `array<T>`",
    ],
    [
      "d9",
      "Triage",
      { $ref: "#/$defs/Triage" },
      HOISTING_POSITIONS,
      "schema-subset.md:76 — a named reference. The `@<T>` annotation root is excluded because a " +
        "NAMED root resolves to the declaration's own body there rather than emitting a `$ref` — " +
        "its own rule, unmoved by this fix",
    ],
  ];

  for (const [cell, source, expected, positions, why] of CONTROLS) {
    it(`CONTROL (${cell}): \`${source}\` keeps ${JSON.stringify(expected)}`, () => {
      for (const position of positions) {
        const fragment = fragmentOf(cell, position, source);
        expect(
          fragment,
          `${cell} [${position}]: ${why}; observed ${JSON.stringify(fragment)}`,
        ).toEqual(expected);
      }
    });
  }

  it("CONTROL (d10): `{m: integer}` keeps its fragment AND its minted name at both hoisting depths", () => {
    // The inline-object arm bug 0035 built and bug 0039 shared is untouched:
    // a non-literal field type reaches `lowerTypeExpr` through the same
    // recursion as before, so this slug — already identical across positions at
    // HEAD — is the pin that a literal check inserted BEFORE the brace test
    // changed nothing for the sources that check declines.
    for (const position of HOISTING_POSITIONS) {
      expect(
        refNameOf("d10", position, "{m: integer}"),
        `d10 [${position}]: bug 0056 §Fix constraint 1 — "Nothing else moves", and 0035's and ` +
          `0039's locks over this position are all in the unmoved set`,
      ).toBe(M_INTEGER_INLINE);
      expect(
        defOf("d10", position, "{m: integer}", M_INTEGER_INLINE),
        `d10 [${position}]: the hoisted fragment is unchanged`,
      ).toEqual(M_INTEGER_FRAGMENT);
    }
    expect(
      fragmentOf("d10", "annotation", "{m: integer}"),
      "d10 [annotation]: the annotation root inlines the same fragment",
    ).toEqual(M_INTEGER_FRAGMENT);
  });

  it("CONTROL (d11): the `Triage` declaration the controls resolve against is itself unmoved", () => {
    const read = readAt("params", "Triage");
    expect(
      read.defs,
      "d11: `schema Triage { urgent: boolean }` lowers through the object and primitive arms, " +
        "neither of which this fix touches",
    ).toEqual({ Triage: TRIAGE_DEF });
  });

  it("d12: `-1 | 1` at `params:` is a measured consequence of sharing one recogniser, not an adjudication of bug 0042's `-` handling", () => {
    // `parseLiteralArm`'s `/^-?\d+(\.\d+)?$/` already accepts a negative
    // numeric atom at the three `lowerTypeSource` positions, so sharing that
    // same recogniser (bug 0056 §Fix) makes the `params:` position join an
    // agreement those positions already had for this union — even though bug
    // 0056 §Non-goals holds negative numerics OUTSIDE constraint 1's own
    // enumerated table. This cell records that measured consequence; it
    // adjudicates nothing about bug 0042's parse-layer `-` handling, which
    // stays open (bug 0056 §Non-goals). The `schema`-body and alias refusals
    // below are read as untouched controls for that open question, not as
    // this cell's subject.
    const paramsFragment = fragmentOf("d12", "params", "-1 | 1");
    expect(
      paramsFragment,
      `d12 [params]: the shared recogniser accepts a negative numeric atom the same way it ` +
        `accepts a positive one, so this union lowers the settled all-literal fragment; ` +
        `observed ${JSON.stringify(paramsFragment)}`,
    ).toEqual({ enum: [-1, 1] });

    const annotationFragment = fragmentOf("d12", "annotation", "-1 | 1");
    expect(
      annotationFragment,
      `d12 [annotation]: this position already reaches \`parseLiteralArm\` through ` +
        `\`lowerTypeSource\`, so its bytes are the UNMOVED reference the \`params:\` column is ` +
        `measured against; observed ${JSON.stringify(annotationFragment)}`,
    ).toEqual({ enum: [-1, 1] });

    const fieldDoc = parseDoc(
      "---\nmode: prompt\nparams:\n  p: S\n---\nschema S { a: -1 | 1 }\nlet inert = 1\ninert\n",
      "bug0056.theta",
    );
    expect(
      fieldDoc.diagnostics.map((d) => d.code),
      `d12 [field]: \`-\` is a parse-layer question bug 0042's family owns, untouched here — ` +
        `\`schema S { a: -1 | 1 }\` is refused before any lowering runs, so this position never ` +
        `reaches a fragment to compare; observed ` +
        `${JSON.stringify(fieldDoc.diagnostics.map((d) => d.code))}`,
    ).toEqual(["theta/parse/empty-schema-body"]);

    const aliasDoc = parseDoc(
      "---\nmode: prompt\nparams:\n  a: X\n---\nschema X = -1 | 1\nlet inert = 1\ninert\n",
      "bug0056.theta",
    );
    expect(
      aliasDoc.diagnostics.map((d) => d.code),
      `d12 [alias]: the same bug-0042-family parse layer refuses \`schema X = -1 | 1\` too, by a ` +
        `different route (a malformed right-hand side plus the stray-\`|\` residue it leaves); ` +
        `observed ${JSON.stringify(aliasDoc.diagnostics.map((d) => d.code))}`,
    ).toEqual(["theta/parse/malformed-alias-rhs", "theta/parse/unsupported-feature"]);
  });
});

// ===========================================================================
// (e) THE BOOLEAN ROWS (§Fix constraint 3) — both load with zero diagnostics.
// The bug doc's §Reproduction rows for these are STALE at HEAD.
// ===========================================================================

describe("bug 0056 (e) — a boolean literal at `params:` loads and lowers", () => {
  it("CONTROL (e1): `p: 'true'` already loads clean at HEAD and lowers `{\"const\":true}`", () => {
    // Bug 0044's fix (0.54.0) gave `lowerTypeExpr`'s atom section its own
    // `true` / `false` arm, ahead of the `IDENTIFIER` / `NamedType` test that
    // would otherwise consume the spelling — so the refusal the bug doc records
    // (`theta/parse/unresolved-named-type` naming `true`) is already gone, and
    // this row is a no-op control rather than an inversion. It is pinned so a
    // shared literal recogniser inserted ahead of the brace test cannot change
    // an emission that already agrees with schema-subset.md:79.
    const read = readAt("params", "true");
    expect(
      read.diags,
      "e1: `true` is a `LiteralType` (grammar.md:102), not a `NamedType` (:98), so no " +
        "unresolved-name diagnostic may name it; observed " + JSON.stringify(read.diags),
    ).toEqual([]);
    expect(
      read.fragment,
      `e1: schema-subset.md:79; observed ${JSON.stringify(read.fragment)}`,
    ).toEqual({ const: true });
  });

  it("RED (e2): `p: 'true | false'` loads clean and lowers `{\"enum\":[true,false]}`", () => {
    // The boolean row that DOES move: each atom lowers to its own
    // `{"const":…}` through bug 0044's arm, `classifyLoweredUnionArm` reads a
    // `const` fragment as non-primitive, and `lowerUnion` emits `anyOf` — the
    // all-arms-literal test that would have returned the `enum` form first is
    // the arm this position lacks. The three contrast positions emit
    // `{"enum":[true,false]}` for the same text.
    const read = readAt("params", "true | false");
    expect(
      read.diags,
      `e2: both atoms are \`LiteralType\` (grammar.md:102), so the union is grammar-admitted and ` +
        `raises nothing; observed ${JSON.stringify(read.diags)}`,
    ).toEqual([]);
    expect(
      read.fragment,
      `e2: schema-subset.md:80's bare \`enum\` — :80 spells the \`"string"\` type for an enum or ` +
        `a STRING-literal union, and \`{"type":"string"}\` would refuse both values this union ` +
        `declares; observed ${JSON.stringify(read.fragment)}`,
    ).toEqual({ enum: [true, false] });
  });
});

// ===========================================================================
// (f) THE BINDER ENVELOPE AND THE `Parameters:` LINE — the two model-facing
// surfaces the bug doc names, one of which must move and one of which must not.
// RED at HEAD: the envelope's `ok.args` carries two empty variants.
// ===========================================================================

describe("bug 0056 (f) — the enforcing fragment reaches the model-facing schema", () => {
  it("RED (f1): `relaxParamsSchema` copies the literal fragment into the envelope's `ok.args`", () => {
    // `buildBinderEnvelopeSchema` (src/binder/binder-envelope.ts) is the whole
    // route: `relaxParamsSchema` copies the lowered document's `properties`
    // verbatim into the `ok` arm's `args`, removing only defaulted names from
    // `required`. So whatever the `params:` position lowered is exactly what
    // constrains the binder model's forced-tool input — two empty variants give
    // grammar-constrained decoding nothing to constrain.
    const paramsSchema = paramsDocument("f1", '"x" | "y"');
    const envelope = buildBinderEnvelopeSchema({ paramsSchema, defaultedFields: [] });
    const arms = envelope["anyOf"] as ReadonlyArray<Record<string, unknown>>;
    const okArm = arms[0];
    if (okArm === undefined) {
      throw new Error(
        `f1: BNDR-1 gives the envelope three arms with \`ok\` first; observed ${JSON.stringify(envelope)}`,
      );
    }
    const args = (okArm["properties"] as Record<string, unknown>)["args"] as Record<string, unknown>;
    expect(
      args,
      `f1: the relaxed copy carries the lowered fragment unchanged, so an enforcing \`params:\` ` +
        `lowering is what the binder is constrained by; observed ${JSON.stringify(args)}`,
    ).toEqual({
      type: "object",
      properties: { p: XY_ENUM },
      required: ["p"],
      additionalProperties: false,
    });
    const property = (args["properties"] as Record<string, unknown>)["p"] as Record<string, unknown>;
    expect(
      Object.keys(property),
      `f1: the copy is verbatim, so the key order schema-subset.md:80 spells survives into the ` +
        `provider-facing document; observed ${JSON.stringify(property)}`,
    ).toEqual(XY_ENUM_KEY_ORDER);
  });

  it("CONTROL (f2): the `Parameters:` line still renders the declared type verbatim", () => {
    // binder-bypass-and-envelope.md:129 (*Type display*) makes the surface type
    // normative on this line, never the lowering, so closing the schema side
    // must leave the prompt side byte-identical. The mapping below is
    // `binderPromptParamField`'s (src/extension/production-theta-producer.ts),
    // mirrored so the recorded field this test reads is the one production
    // renders.
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n  p: ${yamlQuoted('"x" | "y"')}\n---\nlet inert = 1\ninert\n`,
      "bug0056.theta",
    );
    expect(diagLines(doc), "f2: the binder fixture must load clean").toEqual([]);
    const field = doc.frontmatter?.params?.fields[0];
    if (field === undefined) {
      throw new Error(
        `f2: the theta declares one \`params:\` field, so the recorded field list must carry it; ` +
          `observed ${JSON.stringify(doc.frontmatter?.params)}`,
      );
    }
    expect(
      field.type,
      "f2: frontmatter-fields-a.md:58 — the author's type text is recorded verbatim, which is " +
        "what the lowering must now agree with rather than drop",
    ).toBe('"x" | "y"');
    expect(
      renderBinderParamLine({
        wireName: field.wireName,
        type: field.type,
        requirement:
          field.hasDefault && field.defaultSource !== undefined
            ? { kind: "default", literal: field.defaultSource }
            : { kind: "required" },
      }),
      "f2: binder-bypass-and-envelope.md:117's `<wire-name> (<type>) <requirement>` template " +
        "over the surface type",
    ).toBe('  p ("x" | "y") required');
  });
});
