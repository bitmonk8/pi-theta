import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBinderEnvelopeSchema } from "../src/binder/binder-envelope";
import { renderBinderParamLine } from "../src/binder/binder-system-prompt";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0164 — `lowerTypeExpr` recurses a GENERIC's ARGUMENT through ITSELF and
// never through the literal sublanguage, so `array<"x" | "y">` lowers
// `{"type":"array","items":{"anyOf":[{},{}]}}` and `array<"x">` lowers
// `items: {}` at all four `Type` positions: the declared element type enforces
// nothing, a real `AjvSchemaValidator` admits `[7, null, {}]` for an array the
// author closed to two strings, and the byte-identical declaration spelled
// `schema Sev = "x" | "y"` plus `array<Sev>` refuses all three — with no
// diagnostic distinguishing them
// (docs/bugs/0164-generic-argument-literal-lowers-permissive.md).
//
// THE MECHANISM, one absence below all four positions. Two functions call the
// literal sublanguage, and both call it at the TOP of a type source only:
// `lowerParamsFieldType` (src/parser/params.ts:1428, the call at `:1433`) and
// `lowerTypeSource` (src/parser/body-type-lowering.ts). An `array<…>` source is
// neither a literal nor brace-rooted, so both decline it and hand it WHOLE to
// `lowerTypeExpr` (src/parser/params.ts:665). Its generic-application arm
// (`:695`) then owns everything below the angle bracket:
//
//   - `:700` tests `ctor === "array"` at arity 1 and `:702` returns
//     `{ type: "array", items: lowerTypeExpr(first, lowerCtx) }` — the
//     SELF-recursion. Nothing on that path can reach a literal rule.
//   - `:707` is the best-effort loop for every other constructor, also
//     `lowerTypeExpr`.
//
// For `array<"x">` the argument is a single literal atom, which matches no arm
// of `lowerTypeExpr` and falls to its trailing catch-all — `{}`. For
// `array<"x" | "y">` the argument reaches the union split (`:676`); the arm set
// is ALL-literal, so `isMixedLiteralArmSet` (`:837`) is false and bug 0184's
// gated per-arm consult (`lowerLiteralUnionArm`, `:858`, reached at `:681`) does
// not fire; each arm re-enters `lowerTypeExpr` and returns `{}`; the inlined
// primitive test reads `{}` as `non-primitive` and `lowerUnion` emits
// `{"anyOf":[{},{}]}`. That is SUBS-1 applied faithfully to arms carrying no
// information.
//
// The ingredient is one function away and exported: `lowerLiteralSublanguage`
// (src/parser/params.ts:1356) splits on `|` (`:1357`), requires every arm to
// parse through `parseLiteralArm` (`:1271`), and emits bug 0055's landed
// ternary (`:1362-1364`) or the single-atom `const` (`:1369`).
//
// THE SETTLED PLACEMENT — §Fix's route (i), AT THE ARGUMENT. Both argument call
// sites (`:702`'s arity-1 `array` argument and `:707`'s best-effort loop)
// consult `lowerLiteralSublanguage` first and fall back to `lowerTypeExpr` on a
// decline. `lowerTypeExpr`'s PER-ARM union recursion (`:681`, bug 0184's
// mixed-gated `lowerLiteralUnionArm`) is UNTOUCHED, which is what leaves
// `array<"x" | integer>` — a MIXED union whose literal arm bug 0184 already
// moved — exactly where it is (group (d)). §Fix constraint 1: the argument
// split's nesting mode does not widen; a remedy changes where the argument text
// GOES, never what `splitTopLevel`'s angle-only default (`:1607`) hands it.
//
// WHAT IS RED HERE — every cell whose subject is the moved `items`:
//   - group (a): all eleven rows and their eleven key-order twins (the
//     four-position byte and key-order parity over §Fix constraint 2's table).
//   - group (dp): every row's DEPTH-PARITY comparison, because the argument
//     depth disagrees with depth 0 today.
//   - group (b): `b1` / `b2` / `b3` / `b4` — every AJV refusal below is `true`
//     at HEAD.
//   - group (c): `c2`, the convergence of the two spellings of one declaration.
//   - group (e): `e1` and `e2`, the re-minted `__inline_<slug>` names.
//   - group (f): `f1`, the binder envelope's `ok.args`.
//   - group (g): `g1`…`g6` and `g-collide`.
//
// WHAT IS GREEN AT HEAD AND MUST STAY GREEN: group (0) (the oracle's own
// honesty), the whole of group (d) — the no-op control set that keeps the fix
// from over-reaching, `array<"x" | integer>` and `array<{…}>` and `map<…>` and
// `Result<…>` among them — `c1` (the enforcing `array<Sev>` contrast, byte- and
// verdict-pinned), `e3` (the `{m: array<string>}` mint), `f2` (the surface-type
// `Parameters:` line) and `g7` (`array<Sev>`'s respond-tool name). NO new
// diagnostic is asserted anywhere in this file: §Fix constraint 7 registers no
// code (DIAG-2 — the registry is closed), so every fixture's silence at HEAD is
// its silence after, and every reader below asserts that silence.
//
// THE SLUG ORACLE IS INDEPENDENT. `schemaSlug` (src/parser/schema-lowering.ts)
// is deliberately NOT imported, and `respondSchemaSlug` is imported as the
// SUBJECT only, never as the oracle: an oracle taken from the implementation
// under test proves nothing. Every expected name below is derived from a
// HAND-WRITTEN byte string following schema-subset.md §Canonical schema hash,
// hashed with `node:crypto`, and group (0) keeps those strings honest by
// parse-back equality against the fragment each claims to serialise plus a
// whitespace and key-sort check.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` or `lowerQueryResponseSchema` call over a string,
// plus one real AJV compile through the shipped `AjvSchemaValidator` seam and
// one `buildBinderEnvelopeSchema` / `renderBinderParamLine` call. An integration
// or live tier could observe none of it more sharply: the claim is about the
// exact bytes at a lowering boundary and the 16-hex slug hashed from them, both
// fully determined before any turn runs, and a provider round-trip would add
// stochastic surface over a contract that has none.
//
// NO SILENT SKIPPING: every reader asserts the fixture's diagnostic list is
// empty and then THROWS, naming the absent intermediate, when the lowered
// document, the `$defs` entry or the lowered annotation is missing. A refused
// parse can never be mistaken for a pass.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schema-subset.md:77 — `array<T>`:
//     `{ "type": "array", "items": <T-lowered> }`. `<T-lowered>` is `T` lowered
//     by the same step-3 table that carries :79 and :80.
//   - :79 — 'Literal `"foo"` / `42` / `true` / `null`: `{ "const": <value> }`'.
//   - :80 — the enum / string-literal-union emission
//     `{ "type": "string", "enum": [...] }`, `type` first.
//   - :81 (SUBS-1) — the union rule whose faithful application to information-
//     free arms is what produces the permissive `anyOf` at HEAD.
//   - :85 (*Array element order*) — fixes `enum` value order and `anyOf`
//     variant order as SOURCE order "so that source fragments which lower
//     identically also serialise to identical bytes". It states no emission.
//   - :9 — "**Arrays**: `items` (a single subschema)" makes the element
//     position an ordinary subschema position; :7 admits `enum` and `const` as
//     validation keywords with no positional restriction.
//   - :73 / :98 make `__inline_<slug>` a function of the LOWERED fragment;
//     :99-107 is the canonical form, the SHA-256 digest and the 16-hex
//     truncation the oracle below follows.
//   - :84 — `Result<T, E>` has no lowered-schema form, which is why group (d)'s
//     `Result` cell pins a diagnostic rather than an emission.
//   - docs/spec_topics/grammar.md:99 — `GenericType ::= "array" "<" Type ">"`;
//     :107 — "The `Type` reference inside each `<…>` is recursive"; :95 and
//     :102 put `LiteralType` in `Type`; :105 names "generic type arguments"
//     among the bare-`Type` positions and adds "The grammar is otherwise
//     identical in every position".
//   - docs/spec_topics/type-system.md:7 (generic types), :9 (literal types are
//     valid type expressions), :15 — "The same type grammar applies in every
//     type-annotation position".
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:57 — "`params` are
//     validated with AJV at invocation time"; :58 — a `params:` RHS is "a type
//     expression parsed by the theta type grammar — the same grammar used in
//     every other type-annotation position".
//   - docs/spec_topics/binder/binder-bypass-and-envelope.md (*Type display*) —
//     the `Parameters:` line renders the SURFACE type, never the lowering,
//     which `f2` holds unmoved.

// ===========================================================================
// Substrate — the four `Type` positions and the loud readers over them.
// ===========================================================================

/** The two declarations every row below resolves a named argument against. */
const DECLS = 'schema Sev = "x" | "y"\nschema Triage { urgent: boolean }\n';

/** `schema Sev = "x" | "y"`'s own closed lowering, reached through the literal check at the TOP of its alias RHS. */
const SEV_DEF = { type: "string", enum: ["x", "y"] };

/** `schema Triage { urgent: boolean }`'s closed object form. */
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
 * whole type expression in a YAML single-quoted scalar. The unquoted spelling is
 * not valid YAML and collapses the load to `theta/load/missing-mode`, which is a
 * different frame (the spelling discipline
 * `tests/params-literal-sublanguage-lowering.test.ts` established).
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
    const doc = parseDoc(`---\nmode: prompt\n---\n${DECLS}let inert = 1\ninert\n`, "bug0164.theta");
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
  const doc = parseDoc(source, "bug0164.theta");
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
 * `params:` position) or an absent document.
 */
function fragmentOf(label: string, position: Position, typeSource: string): unknown {
  const read = readAt(position, typeSource);
  expect(
    read.diags,
    `${label} [${position}]: \`${typeSource}\` is grammar-admitted at every type-annotation ` +
      `position (grammar.md:99/:102/:105/:107, type-system.md:9/:15), so this fixture must load ` +
      `with NO diagnostics or the lowering under assertion never runs; observed ` +
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

/**
 * Every object's OWN key order inside `value`, keyed by JSON Pointer. `toEqual`
 * cannot see key order and order is contractual here: `respondSchemaSlug`
 * (src/runtime/typed-query-validation.ts:347) hashes `JSON.stringify(lowered)`
 * and the `__inline_<slug>` mint hashes the canonical form of the same
 * fragment, so two positions agreeing on the key SET and disagreeing on the
 * order would mint two names for one declared value set. `type` before `enum`
 * is what schema-subset.md:80 spells (bug 0056 §Fix *Ordering*).
 */
function keyOrderOf(
  value: unknown,
  pointer = "",
): ReadonlyArray<readonly [string, readonly string[]]> {
  const out: Array<readonly [string, readonly string[]]> = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...keyOrderOf(item, `${pointer}/${index}`)));
    return out;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    out.push([pointer === "" ? "/" : pointer, keys]);
    for (const key of keys) {
      out.push(...keyOrderOf((value as Record<string, unknown>)[key], `${pointer}/${key}`));
    }
    return out;
  }
  return out;
}

/** The whole lowered `params:` document of a theta that MUST load. */
function paramsDocumentOf(label: string, fields: string): LoweredSchema {
  const doc = parseDoc(
    `---\nmode: prompt\nparams:\n${fields}---\n${DECLS}let inert = 1\ninert\n`,
    "bug0164.theta",
  );
  expect(
    diagLines(doc),
    `${label}: the fixture's \`params:\` types are legal theta ` +
      `(frontmatter-fields-a.md:58), so it must load with NO diagnostics; observed ` +
      `${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  const document = loweredParamsDocument(doc);
  if (document === undefined) {
    throw new Error(
      `${label}: the theta declares a \`params:\` block, so its lowered schema must be present ` +
        `(BIND-1); diagnostics ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return document as LoweredSchema;
}

/**
 * The real AJV seam — `strict: false`, `allErrors: true`, the shipped validator,
 * content-addressed exactly as `src/extension/production-composition.ts` does.
 */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => {
    const canonicalBytes = JSON.stringify(schema);
    return { slug: canonicalBytes, canonicalBytes };
  };
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

// ===========================================================================
// The 16-hex slug oracle, independent of the implementation that mints.
// ===========================================================================

/** SHA-256 of the given bytes, first 16 lowercase hex characters (:106, :107). */
function slugOfBytes(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73, :108). */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfBytes(canonical)}`;
}

/**
 * `{m: array<"x" | "y">}` AFTER §Fix — the inline object whose field carries the
 * moved `items`, so its mint is a function of those bytes (§Fix constraint 4).
 * At HEAD the same source mints `__inline_bf7d6fbea15638b6`.
 */
const M_ARRAY_XY_FRAGMENT = {
  type: "object",
  properties: { m: { type: "array", items: { type: "string", enum: ["x", "y"] } } },
  required: ["m"],
  additionalProperties: false,
};
const M_ARRAY_XY_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"items":{"enum":["x","y"],"type":"string"},' +
  '"type":"array"}},"required":["m"],"type":"object"}';
const M_ARRAY_XY_INLINE = inlineDefName(M_ARRAY_XY_CANONICAL);

/**
 * `{m: array<"x">}` AFTER §Fix — the SINGLE-literal argument one level down. At
 * HEAD it mints `__inline_4f092d3f28fd90b7` over an `items` of `{}`.
 */
const M_ARRAY_X_FRAGMENT = {
  type: "object",
  properties: { m: { type: "array", items: { const: "x" } } },
  required: ["m"],
  additionalProperties: false,
};
const M_ARRAY_X_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"items":{"const":"x"},"type":"array"}},' +
  '"required":["m"],"type":"object"}';
const M_ARRAY_X_INLINE = inlineDefName(M_ARRAY_X_CANONICAL);

/**
 * `{m: array<string>}` — the CONTROL mint. `parseLiteralArm` declines `string`,
 * so the argument keeps its `lowerTypeExpr` route and this name does not move.
 */
const M_ARRAY_STRING_FRAGMENT = {
  type: "object",
  properties: { m: { type: "array", items: { type: "string" } } },
  required: ["m"],
  additionalProperties: false,
};
const M_ARRAY_STRING_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"items":{"type":"string"},"type":"array"}},' +
  '"required":["m"],"type":"object"}';
const M_ARRAY_STRING_INLINE = inlineDefName(M_ARRAY_STRING_CANONICAL);

/**
 * The `@<T>` respond-tool documents. `respondSchemaSlug`
 * (src/runtime/typed-query-validation.ts:347) hashes `JSON.stringify(lowered)`
 * — the EMITTED key order, not the key-sorted canonical form (bug 0055
 * §Non-goals records that divergence, and it is why emission key order matters
 * at all) — so each expected name is hashed from the whole lowered DOCUMENT's
 * expected bytes, asserted separately against `JSON.stringify` of the real
 * lowering in group (g).
 *
 * `[cell, annotation, AFTER bytes, HEAD slug, why]`. A HEAD slug of `""` marks
 * an UNCHANGED control.
 */
const RESPOND_ROWS: ReadonlyArray<readonly [string, string, string, string, string]> = [
  [
    "g1",
    'array<"x" | "y">',
    '{"type":"array","items":{"type":"string","enum":["x","y"]}}',
    "375e24c5c87417d8",
    "the string-literal union argument: schema-subset.md:80's emission inside :77's `items`",
  ],
  [
    "g2",
    'array<"x">',
    '{"type":"array","items":{"const":"x"}}',
    "4718677af1cfaad3",
    "the single-literal argument: :79's `const` inside :77's `items`",
  ],
  [
    "g3",
    "array<1 | 2>",
    '{"type":"array","items":{"enum":[1,2]}}',
    "375e24c5c87417d8",
    "the number-literal union argument. Its HEAD slug is IDENTICAL to `g1`'s because both " +
      "arguments lower to the same information-free `{\"anyOf\":[{},{}]}` — two declarations " +
      "with disjoint value sets sharing one registered tool name. After §Fix they must DIFFER " +
      "(`g-collide`)",
  ],
  [
    "g4",
    'array<"x" | null>',
    '{"type":"array","items":{"enum":["x",null]}}',
    "dfff68c6e0ed2d78",
    "the mixed-kind all-literal union: `null` is a `LiteralType` (grammar.md:102) and bug 0056 " +
      "§Fix constraint 2 settled it as one for lowering purposes, so the whole argument reaches " +
      "`lowerLiteralSublanguage`'s bare-`enum` branch rather than the primitive `{\"type\":\"null\"}` " +
      "arm per-arm recursion gives it today",
  ],
  [
    "g5",
    "array<null>",
    '{"type":"array","items":{"const":null}}',
    "65404ea87ccac5b0",
    "a bare `null` argument: at HEAD `lowerTypeExpr`'s `PRIMITIVE_TYPES` test claims it and " +
      "emits `{\"type\":\"null\"}`; the two fragments accept exactly `null`, so this row diverges " +
      "in bytes and slugs, never in a verdict",
  ],
  [
    "g6",
    "array<true | false>",
    '{"type":"array","items":{"enum":[true,false]}}',
    "1a105bdd080709e5",
    "the all-boolean union: bug 0044's atom arm (src/parser/params.ts:723-727) already gave each " +
      "ARM its `const`, so this row is the one literal kind that already constrains at this " +
      "depth — what moves is which ROUTE emits it, and therefore its bytes",
  ],
  [
    "g7",
    "array<Sev>",
    '{"type":"array","items":{"$ref":"#/$defs/Sev"},"$defs":{"Sev":{"type":"string","enum":["x","y"]}}}',
    "",
    "UNCHANGED — `parseLiteralArm` declines `Sev`, so the identifier arm keeps resolving the " +
      "name whole-file and emitting the pointer, and the registered tool keeps its name",
  ],
];

// ===========================================================================
// (0) The slug oracle's own honesty — each hand-written byte string must be the
// fragment it claims to serialise, in the form the recipe it stands for spells.
// GREEN at HEAD and after: this group tests the oracle, not the lowering.
// ===========================================================================

const CANONICAL_PAIRS: ReadonlyArray<readonly [string, string, unknown]> = [
  ['{m: array<"x" | "y">} (post-fix)', M_ARRAY_XY_CANONICAL, M_ARRAY_XY_FRAGMENT],
  ['{m: array<"x">} (post-fix)', M_ARRAY_X_CANONICAL, M_ARRAY_X_FRAGMENT],
  ["{m: array<string>} (control)", M_ARRAY_STRING_CANONICAL, M_ARRAY_STRING_FRAGMENT],
];

describe("bug 0164 (0) — the independent slug oracle", () => {
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

  it("CONTROL (o3): each respond-tool document string parses back and carries the EMISSION's key order, not the sorted one", () => {
    // `respondSchemaSlug` hashes `JSON.stringify(lowered)`
    // (typed-query-validation.ts:347), so these strings stand for the EMITTED
    // bytes — `type` before `items` at the root, `type` before `enum` inside a
    // string-literal union's `items` — which is the opposite of the canonical
    // form's sort. Pinning both properties keeps the two oracles from being
    // confused for one another.
    for (const [cell, annotation, bytes] of RESPOND_ROWS) {
      expect(
        bytes,
        `o3 [${cell}, ${annotation}]: the string must be minimal JSON of the value it denotes; ` +
          `observed ${bytes}`,
      ).toBe(JSON.stringify(JSON.parse(bytes)));
      const rootKeys = Object.keys(JSON.parse(bytes) as Record<string, unknown>);
      expect(
        rootKeys[0],
        `o3 [${cell}, ${annotation}]: schema-subset.md:77 emits \`type\` then \`items\`, and the ` +
          `lowered document appends its \`$defs\` closure last, which is the order the slug hashes`,
      ).toBe("type");
    }
  });
});

// ===========================================================================
// (a) THE MOVED CLASS — four-position BYTE and KEY-ORDER parity over §Fix
// constraint 2's whole table (§Fix constraint 8). One grammar
// (type-system.md:15, grammar.md:105) and one emission table
// (schema-subset.md step 3) give one answer per type expression, at `params`,
// the `schema`-body field, the alias RHS and the `@<T>` annotation root.
// RED at HEAD: every row.
// ===========================================================================

/** `[cell, source, the one fragment all four positions owe it, the rule that owes it]`. */
const PARITY_ROWS: ReadonlyArray<readonly [string, string, unknown, string]> = [
  [
    "a1",
    'array<"x" | "y">',
    { type: "array", items: { type: "string", enum: ["x", "y"] } },
    "schema-subset.md:77 emits `items` as `T` lowered by step 3, and :80 is the step-3 row for a " +
      "string-literal union: `{ \"type\": \"string\", \"enum\": [...] }`, `type` first. At HEAD " +
      "`items` is `{\"anyOf\":[{},{}]}` — two variants, each of which AJV satisfies with every " +
      "JSON value — so no element is ever refused (group (b))",
  ],
  [
    "a2",
    'array<"x">',
    { type: "array", items: { const: "x" } },
    "the SINGLE-literal argument: :79 gives `{ \"const\": <value> }`. At HEAD the atom matches no " +
      "arm of `lowerTypeExpr` and falls to its trailing catch-all, so `items` is a bare `{}` — " +
      "one step worse in bytes than a1 and identical in effect",
  ],
  [
    "a3",
    'array<"a" | "b" | "c">',
    { type: "array", items: { type: "string", enum: ["a", "b", "c"] } },
    "three arms rather than two, to fix that :85's *Array element order* is read as SOURCE " +
      "enumeration order and that the emission is not arity-specific",
  ],
  [
    "a4",
    "array<1 | 2>",
    { type: "array", items: { enum: [1, 2] } },
    "the NUMBER-literal union. §Fix constraint 6: this row inherits whatever " +
      "`lowerLiteralSublanguage`'s bare-`enum` branch (src/parser/params.ts:1364) emits — bug " +
      "0098's subject — rather than choosing new bytes here. The depth-parity group proves the " +
      "inheritance rather than restating it",
  ],
  [
    "a5",
    "array<1.5 | -2>",
    { type: "array", items: { enum: [1.5, -2] } },
    "a non-integer and a negative literal, so the row is about what `parseLiteralArm` recognises " +
      "as a NUMBER rather than about integers. `array<…>`'s angle brackets keep the argument off " +
      "the `schema`-body and alias grammars that refuse this text at DEPTH 0, so the argument " +
      "depth is the only place all four positions can agree on it",
  ],
  [
    "a6",
    'array<"x" | 1>',
    { type: "array", items: { enum: ["x", 1] } },
    "an all-literal union of MIXED literal KINDS — still all-literal, so the whole argument is " +
      "what the recogniser accepts and the bare-`enum` branch is reached; :80's `type` prefix is " +
      "not (its `enum` values are not all strings)",
  ],
  [
    "a7",
    'array<"x" | null>',
    { type: "array", items: { enum: ["x", null] } },
    "`null` as a `LiteralType` ARM (grammar.md:102), which bug 0056 §Fix constraint 2 settled " +
      "for every other position. At HEAD the arm reaches `lowerTypeExpr`'s `PRIMITIVE_TYPES` " +
      "test instead and emits `{\"type\":\"null\"}` beside an information-free `{}`",
  ],
  [
    "a8",
    "array<null>",
    { type: "array", items: { const: null } },
    "a bare `null` argument. :79 names `null` among the literal row's own members while the " +
      "primitive row names none; the settlement lives in `lowerLiteralSublanguage`, and this " +
      "depth is exactly where the argument never reached it. The two fragments accept exactly " +
      "`null`, so what moves is bytes and slugs, never a verdict",
  ],
  [
    "a9",
    "array<true | false>",
    { type: "array", items: { enum: [true, false] } },
    "the all-boolean union. Bug 0044's atom arm (src/parser/params.ts:723-727) already gives " +
      "each ARM its `{\"const\":…}`, so this is the one literal kind that CONSTRAINS at this " +
      "depth today — and its bytes still diverge from what the same source emits at depth 0. " +
      "What moves is the route, which is why the depth-parity group is the sharper cell",
  ],
  [
    "a10",
    'array<array<"x" | "y">>',
    { type: "array", items: { type: "array", items: { type: "string", enum: ["x", "y"] } } },
    "TWICE-NESTED (§Fix constraint 8 requires it). Each `array` level emits its own " +
      "`{\"type\":\"array\"}` and hands the remainder back to the same recursion, so a fix at the " +
      "argument reaches every level and a fix that only special-cased depth 1 would leave this " +
      "row behind",
  ],
  [
    "a11",
    'array<array<"x">>',
    { type: "array", items: { type: "array", items: { const: "x" } } },
    "the twice-nested SINGLE literal: at HEAD the innermost `items` is the bare `{}` two levels " +
      "down, where no `{}`-shaped audit of the root fragment can see it",
  ],
  [
    "a12",
    "array<7>",
    { type: "array", items: { const: 7 } },
    "the SINGLE-NUMBER-literal argument, the untested half of a2's row: schema-subset.md:79's " +
      "`{ \"const\": <value> }` names `\"foo\" / 42 / true / null` together, and " +
      "`lowerLiteralSublanguage`'s single-atom branch (src/parser/params.ts:1369) returns " +
      "`{ const: lit.value }` with no test on `lit`'s kind, so the number half of the row rides " +
      "the same branch a2 pins for strings. Appended rather than placed beside a2 — inserting it " +
      "there would renumber a3 through a11, which other documents may cite by id",
  ],
];

describe("bug 0164 (a) — a literal generic argument lowers its step-3 emission at all four positions", () => {
  for (const [cell, source, expected, why] of PARITY_ROWS) {
    it(`RED (${cell}): \`${source}\` lowers ${JSON.stringify(expected)} at every position`, () => {
      for (const position of POSITIONS) {
        const fragment = fragmentOf(cell, position, source);
        expect(
          fragment,
          `${cell} [${position}]: ${why}; observed ${JSON.stringify(fragment)}`,
        ).toEqual(expected);
      }
    });

    it(`RED (${cell}-keys): \`${source}\`'s KEY ORDER agrees with the emission at every position, and the four positions agree byte for byte`, () => {
      const expectedOrder = keyOrderOf(expected);
      const rendered: Array<readonly [Position, string]> = [];
      for (const position of POSITIONS) {
        const fragment = fragmentOf(`${cell}-keys`, position, source);
        expect(
          keyOrderOf(fragment),
          `${cell}-keys [${position}]: the fragment is slug-bearing — \`respondSchemaSlug\` ` +
            `hashes \`JSON.stringify(lowered)\` and the \`__inline_<slug>\` mint hashes the ` +
            `canonical form of the same fragment — so key order is contractual, not cosmetic, ` +
            `and \`type\` before \`enum\` is what schema-subset.md:80 spells (bug 0056 §Fix ` +
            `*Ordering*); expected ${JSON.stringify(expectedOrder)}, observed ` +
            `${JSON.stringify(keyOrderOf(fragment))} over ${JSON.stringify(fragment)}`,
        ).toEqual(expectedOrder);
        rendered.push([position, JSON.stringify(fragment)]);
      }
      const reference = rendered[0]?.[1];
      for (const [position, bytes] of rendered) {
        expect(
          bytes,
          `${cell}-keys [${position}]: type-system.md:15 gives one grammar per position and ` +
            `schema-subset.md step 3 one emission per type form, so \`${source}\` has ONE byte ` +
            `sequence. The four positions AGREE at HEAD — on the wrong answer, because the ` +
            `absence sits below all of them — so §Fix constraint 4 makes the agreement a ` +
            `property to PRESERVE, not one to establish: a fix that moved one position without ` +
            `the others would split a minted name that is currently single; rendered ` +
            `${JSON.stringify(rendered)}`,
        ).toBe(reference);
      }
    });
  }
});

// ===========================================================================
// (dp) THE DEPTH-PARITY GROUP — §Fix constraint 6's inheritance claim in its
// strongest form. The fix mints NO new spec meaning: whatever the SAME argument
// text lowers to at DEPTH 0 — as a whole `params:` / field / alias / annotation
// type source, measured at HEAD and unchanged by this fix — is what the argument
// depth must carry inside `items`. Both sides are OBSERVED through `readAt`; the
// cell compares two readings rather than restating a literal, so it cannot be
// satisfied by a third value no step-3 row states.
// RED at HEAD: every row, because the argument depth disagrees with depth 0.
// ===========================================================================

/**
 * `[cell, the argument text, the `array<…>` wrapping of it, the positions the
 * DEPTH-0 spelling loads clean at, why]`.
 *
 * `array<1.5 | -2>` is absent by measurement, not by choice: at depth 0 the text
 * `1.5 | -2` draws `theta/parse/empty-schema-body` at the `schema`-body field
 * position and `theta/parse/malformed-alias-rhs` at the alias position, so there
 * is no four-position depth-0 reading to compare against. Its `params:` and
 * annotation readings are `{"enum":[1.5,-2]}`, which is what group (a)'s `a5`
 * pins inside `items`.
 */
const DEPTH_ROWS: ReadonlyArray<readonly [string, string, readonly Position[], string]> = [
  [
    "dp1",
    '"x" | "y"',
    POSITIONS,
    "the string-literal union: :80's `{\"type\":\"string\",\"enum\":[…]}`, `type` first",
  ],
  ["dp2", '"x"', POSITIONS, "the single string literal: :79's `{\"const\":\"x\"}`"],
  ["dp3", '"a" | "b" | "c"', POSITIONS, "three arms, same rule"],
  [
    "dp4",
    "1 | 2",
    POSITIONS,
    "the bare-`enum` branch (src/parser/params.ts:1364), whose bytes bug 0098 owns and this " +
      "report inherits rather than decides (§Fix constraint 6)",
  ],
  ["dp5", '"x" | 1', POSITIONS, "the mixed-KIND all-literal union, same branch"],
  [
    "dp6",
    '"x" | null',
    POSITIONS,
    "`null` as a literal ARM, the settlement bug 0056 §Fix constraint 2 already made everywhere " +
      "else",
  ],
  ["dp7", "null", POSITIONS, "the bare `null` literal: `{\"const\":null}`"],
  ["dp8", "true | false", POSITIONS, "the all-boolean union on the same bare-`enum` branch"],
  [
    "dp9",
    "7",
    POSITIONS,
    "the single number literal, the untested half of dp2's row: :79's `{\"const\":7}`, the same " +
      "kind-agnostic single-atom branch (src/parser/params.ts:1369) dp2 pins for strings. Unlike " +
      "`1.5 | -2` (a5's note above), bare `7` was measured to load with NO diagnostics at all " +
      "four depth-0 positions, so the four-position comparison this group runs is available here",
  ],
];

describe("bug 0164 (dp) — a generic argument's `items` is byte-identical to the SAME text lowered at depth 0", () => {
  for (const [cell, argument, positions, why] of DEPTH_ROWS) {
    const wrapped = `array<${argument}>`;
    it(`RED (${cell}): \`${wrapped}\`'s \`items\` equals \`${argument}\` lowered at depth 0`, () => {
      for (const position of positions) {
        const depthZero = fragmentOf(`${cell}-depth0`, position, argument);
        const wrappedFragment = fragmentOf(cell, position, wrapped) as Record<string, unknown>;
        expect(
          wrappedFragment["type"],
          `${cell} [${position}]: schema-subset.md:77 emits the container as ` +
            `\`{"type":"array","items":<T-lowered>}\`, so the outer keys are the premise this ` +
            `cell rests on; observed ${JSON.stringify(wrappedFragment)}`,
        ).toBe("array");
        expect(
          JSON.stringify(wrappedFragment["items"]),
          `${cell} [${position}]: ${why}. schema-subset.md:77 makes \`items\` the SAME step-3 ` +
            `lowering of the SAME text, and :9 makes the element position an ordinary subschema ` +
            `position — so the fix mints no new spec meaning, it routes the argument to the ` +
            `emission depth 0 already has (§Fix constraint 6). Depth 0 lowers ` +
            `${JSON.stringify(depthZero)}; \`items\` observed ` +
            `${JSON.stringify(wrappedFragment["items"])}`,
        ).toBe(JSON.stringify(depthZero));
        expect(
          keyOrderOf(wrappedFragment["items"]),
          `${cell} [${position}]: the parity is over BYTES, key order included, because both ` +
            `fragments are slug-bearing inputs to the same two hashes`,
        ).toEqual(keyOrderOf(depthZero));
      }
    });
  }
});

// ===========================================================================
// (b) REAL AJV over the lowered `params:` document — the enforcement inversion.
// The lowered fragment is the only enforcement the argument gets
// (frontmatter-fields-a.md:57), and three sites compile that document: the
// binder envelope build, the post-default-merge compile and the subagent child's
// params intake.
// RED at HEAD: every REFUSED row below is `true`.
// ===========================================================================

/** `[label, the `p` payload, whether the declaration admits it]`. */
type PayloadRow = readonly [string, unknown, boolean];

/**
 * `p: 'array<"x" | "y">'`. The last two rows are the OUTER-`type` controls —
 * they are the whole of what the declared type enforces at HEAD, and they must
 * keep refusing.
 */
const XY_PAYLOADS: readonly PayloadRow[] = [
  ['["x"]', ["x"], true],
  ['["x","y"]', ["x", "y"], true],
  ["[]", [], true],
  ['["zzz"]', ["zzz"], false],
  ["[7]", [7], false],
  ["[true]", [true], false],
  ["[null]", [null], false],
  ["[[]]", [[]], false],
  ["[{}]", [{}], false],
  ["[7,null,{}]", [7, null, {}], false],
  ['"notanarray"', "notanarray", false],
  ["7", 7, false],
];

/** `p: 'array<"x">'` — one declared element, so `["x","y"]` is refused too. */
const X_PAYLOADS: readonly PayloadRow[] = [
  ['["x"]', ["x"], true],
  ["[]", [], true],
  ['["zzz"]', ["zzz"], false],
  ['["x","y"]', ["x", "y"], false],
  ["[7]", [7], false],
  ["[7,null,{}]", [7, null, {}], false],
];

/** `p: 'array<1 | 2>'` — the non-string branch, where `"1"` must not pass for `1`. */
const N_PAYLOADS: readonly PayloadRow[] = [
  ["[1]", [1], true],
  ["[2]", [2], true],
  ["[1,2]", [1, 2], true],
  ["[]", [], true],
  ["[3]", [3], false],
  ['["1"]', ["1"], false],
  ["[null]", [null], false],
  ["[{}]", [{}], false],
];

/** `p: 'array<array<"x" | "y">>'` — the nested form; `[7]` is refused by the INNER `{"type":"array"}`. */
const NESTED_PAYLOADS: readonly PayloadRow[] = [
  ['[["x"]]', [["x"]], true],
  ['[["zzz"]]', [["zzz"]], false],
  ["[[7,null,{}]]", [[7, null, {}]], false],
  ["[7]", [7], false],
];

const AJV_CELLS: ReadonlyArray<readonly [string, string, readonly PayloadRow[], string]> = [
  [
    "b1",
    'array<"x" | "y">',
    XY_PAYLOADS,
    "the author closed the element type to two strings. At HEAD `items` is `{\"anyOf\":[{},{}]}` " +
      "and the only values refused are the ones the outer `{\"type\":\"array\"}` alone refuses, so " +
      "a param declared `array<\"x\" | \"y\">` binds `[7, null, {}]` and the body runs on it",
  ],
  [
    "b2",
    'array<"x">',
    X_PAYLOADS,
    "one declared element: at HEAD `items` is a bare `{}` with no `anyOf` wrapper — one step " +
      "worse in bytes and identical in effect",
  ],
  [
    "b3",
    "array<1 | 2>",
    N_PAYLOADS,
    "the non-string branch. `[\"1\"]` is the row that separates a real `enum` from a permissive " +
      "variant: JSON `\"1\"` is not JSON `1`, and only an emission carrying the values can say so",
  ],
  [
    "b4",
    'array<array<"x" | "y">>',
    NESTED_PAYLOADS,
    "nesting costs the defect nothing and gains it nothing at HEAD: every `array` level " +
      "constrains its container and no level constrains the leaf",
  ],
];

describe("bug 0164 (b) — the production validator over the lowered `params:` document", () => {
  for (const [cell, source, payloads, why] of AJV_CELLS) {
    it(`RED (${cell}): \`p: '${source}'\` admits exactly the element values the declaration names`, () => {
      const document = paramsDocumentOf(cell, `  p: ${yamlQuoted(source)}\n  note: string\n`);
      const compiled = ajv().compile(document);
      for (const [label, value, admitted] of payloads) {
        const result = compiled.validate({ p: value, note: "n" });
        expect(
          result.ok,
          `${cell}: ${why}. frontmatter-fields-a.md:57 makes AJV the enforcement and three ` +
            `sites compile this document (the binder envelope build, the post-default-merge ` +
            `compile and the subagent child's params intake). ` +
            `\`{"p":${label},"note":"n"}\` must be ${admitted ? "ACCEPTED" : "REFUSED"} against ` +
            `${JSON.stringify(document)}; observed ${JSON.stringify(result)}`,
        ).toBe(admitted);
      }
    });
  }
});

// ===========================================================================
// (c) THE ENFORCING CONTRAST, byte-pinned and unmoved — and the CONVERGENCE the
// bug's headline names. `schema Sev = "x" | "y"` plus `array<Sev>` is the SAME
// declaration spelled through a name, and it enforces today because the alias's
// own lowering went through the literal check at the TOP of its right-hand side.
// `c1` is GREEN and must stay green; `c2` is the bug's headline and is FALSE at
// HEAD.
// ===========================================================================

describe("bug 0164 (c) — the two spellings of one declaration converge", () => {
  it("CONTROL (c1): `array<Sev>` keeps its `$ref` `items`, its enforcing `$defs` entry and its verdicts", () => {
    // Pinned so the fix is measured against a route that already works rather
    // than against itself. `lowerTypeExpr`'s identifier arm resolves the name
    // whole-file, registers the alias's own — literal-aware — lowering under
    // `$defs.Sev`, and emits the pointer.
    for (const position of POSITIONS) {
      const fragment = fragmentOf("c1", position, "array<Sev>");
      expect(
        fragment,
        `c1 [${position}]: schema-subset.md:76 — a named reference inside :77's \`items\`; ` +
          `observed ${JSON.stringify(fragment)}`,
      ).toEqual({ type: "array", items: { $ref: "#/$defs/Sev" } });
      expect(
        readAt(position, "array<Sev>").defs,
        `c1 [${position}]: the pointer must resolve against the alias's own closed lowering, or ` +
          `the enforcement this cell contrasts with does not exist`,
      ).toEqual({ Sev: SEV_DEF });
    }
    const document = paramsDocumentOf("c1", "  p: array<Sev>\n  note: string\n");
    const compiled = ajv().compile(document);
    for (const [label, value, admitted] of XY_PAYLOADS) {
      expect(
        compiled.validate({ p: value, note: "n" }).ok,
        `c1: the named spelling's verdicts are UNCHANGED by this fix — \`{"p":${label}}\` must ` +
          `be ${admitted ? "ACCEPTED" : "REFUSED"} against ${JSON.stringify(document)}`,
      ).toBe(admitted);
    }
  });

  it("RED (c2): the `array<\"x\" | \"y\">` document and the `array<Sev>` document agree on EVERY payload", () => {
    // THE BUG'S HEADLINE. Two spellings of one declaration behave differently
    // with no signal at load, in the recorded `BypassParamsField.type`, or in
    // the rendered `Parameters:` line — and `docs/spec_topics/schemas.md`
    // routes authors into the losing one ("For inline enumerations use
    // literal-union"). The cell compares two OBSERVED verdict tables rather
    // than asserting either against a literal, so it holds whatever the arm set
    // is: it says the declared value set is a property of the DECLARATION, not
    // of which of the two legal spellings the author reached for.
    const inline = paramsDocumentOf("c2", `  p: ${yamlQuoted('array<"x" | "y">')}\n  note: string\n`);
    const named = paramsDocumentOf("c2", "  p: array<Sev>\n  note: string\n");
    const compiledInline = ajv().compile(inline);
    const compiledNamed = ajv().compile(named);
    for (const [label, value] of XY_PAYLOADS) {
      const inlineVerdict = compiledInline.validate({ p: value, note: "n" }).ok;
      const namedVerdict = compiledNamed.validate({ p: value, note: "n" }).ok;
      expect(
        inlineVerdict,
        `c2: \`array<"x" | "y">\` and \`array<Sev>\` declare the same two element values — the ` +
          `alias's right-hand side IS the union text — so type-system.md:15's one-grammar rule ` +
          `and schema-subset.md:77's one emission give them one verdict table. \`{"p":${label}}\` ` +
          `is ${namedVerdict ? "ACCEPTED" : "REFUSED"} by the named spelling ` +
          `${JSON.stringify(named)} and ${inlineVerdict ? "ACCEPTED" : "REFUSED"} by the inline ` +
          `spelling ${JSON.stringify(inline)}`,
      ).toBe(namedVerdict);
    }
  });
});

// ===========================================================================
// (d) THE NO-OP CONTROL SET (§Fix constraint 2 "Nothing else moves",
// constraint 7 "no new permissive lowering", §Non-goals) — every argument the
// literal recogniser DECLINES keeps its exact bytes and key order at all four
// positions. GREEN at HEAD and required to stay green: these are what keeps the
// fix from over-reaching.
// ===========================================================================

describe("bug 0164 (d) — every argument the recogniser declines keeps its bytes", () => {
  const CONTROLS: ReadonlyArray<readonly [string, string, unknown, string]> = [
    [
      "d1",
      "array<string>",
      { type: "array", items: { type: "string" } },
      "schema-subset.md:77 over :75's primitive. `parseLiteralArm` declines `string`, so the " +
        "argument keeps its `lowerTypeExpr` route unchanged",
    ],
    [
      "d2",
      "array<Sev>",
      { type: "array", items: { $ref: "#/$defs/Sev" } },
      "the ENFORCING contrast (:76), which the recogniser declines as an identifier — group (c) " +
        "reads its verdicts as well as its bytes",
    ],
    [
      "d3",
      "array<Triage>",
      { type: "array", items: { $ref: "#/$defs/Triage" } },
      "the same identifier arm over an OBJECT declaration, so the row is not about what the " +
        "named type lowers to",
    ],
    [
      "d4",
      'array<"x" | integer>',
      { type: "array", items: { anyOf: [{ const: "x" }, { type: "integer" }] } },
      "THE MIXED UNION — the most important control in this file, and the one the bug doc's " +
        "§Repro (g) quotes STALE. It quotes `{\"anyOf\":[{},{\"type\":\"integer\"}]}`, measured at " +
        "v0.85.0; bug 0184 §Fix (v0.115.0) then landed the MIXED-gated per-arm consult " +
        "(`isMixedLiteralArmSet`, src/parser/params.ts:837, reached at `:681`), so at HEAD the " +
        "literal ARM already lowers schema-subset.md:79's `{\"const\":\"x\"}` while `integer` " +
        "keeps its primitive `{\"type\":\"integer\"}`. Bug 0043 §Non-goals holds the CLASS " +
        "permissive-by-arm-set and bug 0164 §Non-goals restates it; §Fix's route (i) sits at the " +
        "ARGUMENT and leaves the per-ARM recursion untouched, so this row is unmoved by this fix " +
        "in either direction",
    ],
    [
      "d5",
      'array<{m: "x"}>',
      { type: "array", items: {} },
      "a BRACE-ROOTED argument, which the literal recogniser declines (§Fix constraint 1, " +
        "§Non-goals). The `{}` comes from `lowerTypeExpr`'s handling of a brace group it does " +
        "not hoist, not from the missing literal rule, and bug 0028's inventory owns whether it " +
        "should exist at all",
    ],
    [
      "d6",
      'array<{m: "x" | "y"}>',
      { type: "array", items: { anyOf: [{}, {}] } },
      "the sharpest brace row: `splitTopLevel`'s angle-only default (src/parser/params.ts:1607) " +
        "cuts the brace group into `{m: \"x\"` and `\"y\"}`, so this `anyOf` arrives from the " +
        "argument SPLIT rather than from the literal check — a fragment that LOOKS like a1's " +
        "HEAD bytes and must not move with them",
    ],
    [
      "d7",
      'array<{m: "x", n: "y"}>',
      {},
      "arity 2 by the same angle-only split, so the arity-1 `array` arm is never taken and the " +
        "best-effort loop returns `{}` (bug 0043 §Non-goals; §Fix constraint 1 forbids widening " +
        "the split to `\"angle-and-brace\"`, because that would disagree with " +
        "`theta/parse/generic-arity-mismatch`)",
    ],
    [
      "d8",
      "array<true>",
      { type: "array", items: { const: true } },
      "a SINGLE boolean literal: unchanged BYTES, changed ROUTE. Bug 0044's atom arm " +
        "(src/parser/params.ts:723-727) emits this today; after §Fix the argument reaches " +
        "`lowerLiteralSublanguage`'s single-atom `const` (`:1369`) instead, and the two spell the " +
        "same fragment. §Fix constraint 2's table lists the row as `unchanged` for exactly that " +
        "reason, and this cell is what makes the re-route observable as a no-op",
    ],
    [
      "d9",
      "array<false>",
      { type: "array", items: { const: false } },
      "the other half of bug 0044's arm, same reading: the route moves and the bytes do not",
    ],
    [
      "d10",
      'map<"x" | "y">',
      {},
      "a NON-`array` constructor. `ctor === \"array\"` fails, so the best-effort loop " +
        "(src/parser/params.ts:707) runs as a RESOLUTION walk and the emission is `{}` " +
        "(§Fix constraint 2 names every non-`array` constructor among the unmoved). Routing that " +
        "loop's arguments through the recogniser changes what it RESOLVES, never what it returns",
    ],
  ];

  for (const [cell, source, expected, why] of CONTROLS) {
    it(`CONTROL (${cell}): \`${source}\` keeps ${JSON.stringify(expected)} at every position`, () => {
      const expectedOrder = keyOrderOf(expected);
      for (const position of POSITIONS) {
        const fragment = fragmentOf(cell, position, source);
        expect(
          fragment,
          `${cell} [${position}]: ${why}; observed ${JSON.stringify(fragment)}`,
        ).toEqual(expected);
        expect(
          keyOrderOf(fragment),
          `${cell} [${position}]: the bytes are pinned, key order included, because the fragment ` +
            `is slug-bearing; observed ${JSON.stringify(fragment)}`,
        ).toEqual(expectedOrder);
      }
    });
  }

  it("CONTROL (d11): `Result<\"x\" | \"y\", string>` keeps its refusal at three positions and its `{}` at the annotation root", () => {
    // §Non-goals: `schema-subset.md:84` makes `Result` unlowerable and
    // `theta/parse/result-in-schema-position` refuses it in a lowered-schema
    // position BEFORE the pass runs, so the best-effort loop
    // (src/parser/params.ts:707) is a resolution walk there and not an
    // emission. A literal argument written inside it changes nothing: this is
    // the ONE cell in this file that expects a diagnostic, and it expects a
    // PRE-EXISTING one (§Fix constraint 7 registers no new code — DIAG-2, the
    // registry is closed).
    const source = 'Result<"x" | "y", string>';
    for (const position of ["params", "field", "alias"] as const) {
      const read = readAt(position, source);
      expect(
        read.diags.map((line) => line.split(":")[0]),
        `d11 [${position}]: the pre-existing refusal is part of this row's pinned disposition; ` +
          `observed ${JSON.stringify(read.diags)}`,
      ).toEqual(["error theta/parse/result-in-schema-position"]);
    }
    const annotation = readAt("annotation", source);
    expect(
      annotation.diags,
      "d11 [annotation]: the annotation root lowers through a direct " +
        "`lowerQueryResponseSchema` call, which raises nothing of its own",
    ).toEqual([]);
    expect(
      annotation.fragment,
      `d11 [annotation]: :84 makes \`Result\` unlowerable, so the root is the permissive \`{}\` ` +
        `bug 0028's inventory owns; observed ${JSON.stringify(annotation.fragment)}`,
    ).toEqual({});
  });

  it("CONTROL (d12): the two declarations every row resolves against are themselves unmoved", () => {
    expect(
      readAt("params", "array<Sev>").defs,
      "d12: `schema Sev = \"x\" | \"y\"` reaches the literal check at the TOP of its alias " +
        "right-hand side, which is why the named spelling already enforces. Step 4 prunes " +
        "`$defs` to what the document reaches, so `Triage` is absent here",
    ).toEqual({ Sev: SEV_DEF });
    expect(
      readAt("params", "array<Triage>").defs,
      "d12: `schema Triage { urgent: boolean }` lowers to its closed object form",
    ).toEqual({ Triage: TRIAGE_DEF });
  });
});

// ===========================================================================
// (e) THE MINTED `$defs` NAMES (§Fix constraint 4) — `__inline_<slug>` is a
// function of the LOWERED fragment (schema-subset.md:73, :98), so every inline
// object carrying a literal-argument field re-mints, and it re-mints at all
// THREE hoisting positions TOGETHER. The agreement across positions is a
// property to preserve, not one to establish.
// RED at HEAD: `e1` (currently `__inline_bf7d6fbea15638b6`) and `e2`
// (currently `__inline_4f092d3f28fd90b7`). `e3` is the control.
// ===========================================================================

describe("bug 0164 (e) — the content-addressed names move with the `items`", () => {
  const MINT_ROWS: ReadonlyArray<
    readonly [string, string, string, unknown, string, string]
  > = [
    [
      "e1",
      '{m: array<"x" | "y">}',
      M_ARRAY_XY_INLINE,
      M_ARRAY_XY_FRAGMENT,
      "RED",
      "the string-literal union one level down: the mint hashes a canonical form whose `m` " +
        "carries schema-subset.md:80's emission inside :77's `items`",
    ],
    [
      "e2",
      '{m: array<"x">}',
      M_ARRAY_X_INLINE,
      M_ARRAY_X_FRAGMENT,
      "RED",
      "the single literal one level down, whose `items` is a bare `{}` at HEAD",
    ],
    [
      "e3",
      "{m: array<string>}",
      M_ARRAY_STRING_INLINE,
      M_ARRAY_STRING_FRAGMENT,
      "CONTROL",
      "the CONTROL: `parseLiteralArm` declines `string`, so this name is UNCHANGED " +
        "(`__inline_f6742b8db79cc0a2` at HEAD and after) and a fix that moved it would have " +
        "reached past what the recogniser accepts",
    ],
  ];

  for (const [cell, source, expectedName, expectedFragment, disposition, why] of MINT_ROWS) {
    it(`${disposition} (${cell}): \`${source}\` mints ONE name at all three hoisting positions, over the fragment that name hashes`, () => {
      const minted = HOISTING_POSITIONS.map(
        (position) => [position, refNameOf(cell, position, source)] as const,
      );
      for (const [position, name] of minted) {
        expect(
          name,
          `${cell} [${position}]: ${why}. §Fix constraint 4 — the mint moves WITH the bytes and ` +
            `at all three positions together; a change that moved one position without the ` +
            `others would split a name that is currently single; minted ${JSON.stringify(minted)}`,
        ).toBe(expectedName);
        // Asserting the BODY as well as the name is what makes the oracle a
        // check on the lowering rather than on itself, and what keeps the
        // `$defs` closure from dangling.
        expect(
          defOf(cell, position, source, expectedName),
          `${cell} [${position}]: the \`$ref\` and the mint must agree, or the enclosing ` +
            `\`$defs\` closure dangles`,
        ).toEqual(expectedFragment);
      }
      // The `@<T>` annotation root is brace-rooted, so it lowers the object IN
      // PLACE rather than hoisting it; its bytes are the mint's input, which is
      // what makes the name above derivable from them.
      expect(
        fragmentOf(cell, "annotation", source),
        `${cell} [annotation]: the annotation root inlines what the other three positions hoist, ` +
          `with the same \`items\``,
      ).toEqual(expectedFragment);
    });
  }
});

// ===========================================================================
// (f) THE BINDER ENVELOPE (§Fix constraint 8) — `relaxParamsSchema`
// (src/binder/binder-envelope.ts) copies the lowered document's `properties`
// VERBATIM into the `ok` arm's `args`, so whatever the `params:` position
// lowered is exactly what constrains the binder model's forced-tool input.
// RED at HEAD: `f1`. `f2` is the surface-type control.
// ===========================================================================

describe("bug 0164 (f) — the enforcing `items` reaches the model-facing schema", () => {
  it("RED (f1): `relaxParamsSchema` copies the moved `items` into the envelope's `ok.args`", () => {
    const paramsSchema = paramsDocumentOf("f1", `  p: ${yamlQuoted('array<"x" | "y">')}\n`);
    const envelope = buildBinderEnvelopeSchema({ paramsSchema, defaultedFields: [] });
    const arms = envelope["anyOf"] as ReadonlyArray<Record<string, unknown>>;
    const okArm = arms[0];
    if (okArm === undefined) {
      throw new Error(
        `f1: BNDR-1 gives the envelope three arms with \`ok\` first; observed ` +
          `${JSON.stringify(envelope)}`,
      );
    }
    const args = (okArm["properties"] as Record<string, unknown>)["args"] as Record<string, unknown>;
    const property = (args["properties"] as Record<string, unknown>)["p"];
    const expected = { type: "array", items: { type: "string", enum: ["x", "y"] } };
    expect(
      property,
      `f1: the relaxed copy carries the lowered fragment unchanged, so an ENFORCING \`items\` is ` +
        `what the binder model is grammar-constrained by. At HEAD it is ` +
        `\`{"anyOf":[{},{}]}\`, which gives constrained decoding nothing to constrain at that ` +
        `position — while the \`Parameters:\` line (f2) tells the model the element type; ` +
        `observed ${JSON.stringify(args)}`,
    ).toEqual(expected);
    expect(
      keyOrderOf(property),
      `f1: the copy is verbatim, so the fragment's key order survives into the provider-facing ` +
        `document; observed ${JSON.stringify(property)}`,
    ).toEqual(keyOrderOf(expected));
  });

  it("CONTROL (f2): the `Parameters:` line still renders the declared theta type verbatim", () => {
    // binder-bypass-and-envelope.md (*Type display*) makes the SURFACE type
    // normative on this line, never the lowering, so closing the schema side
    // must leave the prompt side byte-identical. The prompt line was never the
    // defect: it already carries the element type the schema drops.
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n  p: ${yamlQuoted('array<"x" | "y">')}\n---\n${DECLS}let inert = 1\ninert\n`,
      "bug0164.theta",
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
    ).toBe('array<"x" | "y">');
    expect(
      renderBinderParamLine({
        wireName: field.wireName,
        type: field.type,
        requirement:
          field.hasDefault && field.defaultSource !== undefined
            ? { kind: "default", literal: field.defaultSource }
            : { kind: "required" },
      }),
      "f2: the `<wire-name> (<type>) <requirement>` template over the SURFACE type, unmoved by " +
        "the lowering change",
    ).toBe('  p (array<"x" | "y">) required');
  });
});

// ===========================================================================
// (g) THE `@<T>` POSITION'S REGISTERED-TOOL NAME (§Fix constraint 4, second
// half) — `respondSchemaSlug` (src/runtime/typed-query-validation.ts:347) hashes
// `JSON.stringify(lowered)` to name the registered `__theta_respond_<slug>` tool
// AND the QRY-12 / QRY-15 template references, and `renderTypedAwareQueryText`
// interpolates the fragment itself into the instruction shown to the model. So
// the argument's bytes are both what the model is grammar-constrained by and
// part of a registered tool's name.
// RED at HEAD: g1…g6 and `g-collide`. `g7` is the unchanged control.
// ===========================================================================

describe("bug 0164 (g) — the respond tool's name moves with the lowered annotation", () => {
  /** The lowered annotation document, loud on an absent lowering. */
  function loweredAnnotation(cell: string, annotation: string): LoweredSchema {
    const doc = parseDoc(`---\nmode: prompt\n---\n${DECLS}let inert = 1\ninert\n`, "bug0164.theta");
    expect(
      diagLines(doc),
      `${cell}: the declaration fixture must load clean or nothing resolves; observed ` +
        `${JSON.stringify(diagLines(doc))}`,
    ).toEqual([]);
    const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
    const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
    const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
    if (lowered === undefined) {
      throw new Error(
        `${cell}: \`@<${annotation}>\` produced no lowered document, so there is no fragment to ` +
          `register a respond tool over and nothing for the model to be constrained by`,
      );
    }
    return lowered;
  }

  for (const [cell, annotation, expectedBytes, headSlug, why] of RESPOND_ROWS) {
    const disposition = headSlug === "" ? "CONTROL" : "RED";
    it(`${disposition} (${cell}, @<${annotation}>): the respond tool is named __theta_respond_${slugOfBytes(expectedBytes)}`, () => {
      const lowered = loweredAnnotation(cell, annotation);
      expect(
        JSON.stringify(lowered),
        `${cell}: ${why}. The slug hashes these exact bytes, key order included, so the document ` +
          `is pinned BEFORE the name is${headSlug === "" ? "" : ` (HEAD names this tool __theta_respond_${headSlug})`}; ` +
          `observed ${JSON.stringify(lowered)}`,
      ).toBe(expectedBytes);
      expect(
        `__theta_respond_${respondSchemaSlug(lowered)}`,
        `${cell}: the 16-hex truncation of the SHA-256 of the document bytes above ` +
          `(schema-subset.md:106, :107). The hash is taken over \`JSON.stringify\` rather than ` +
          `over the key-sorted canonical form, which bug 0055 §Non-goals records and which is ` +
          `why emission key order matters at all`,
      ).toBe(`__theta_respond_${slugOfBytes(expectedBytes)}`);
    });
  }

  it("RED (g-collide): `@<array<\"x\" | \"y\">>` and `@<array<1 | 2>>` must name DIFFERENT respond tools", () => {
    // At HEAD both lower to the identical information-free
    // `{"type":"array","items":{"anyOf":[{},{}]}}` and therefore hash to the
    // SAME slug `375e24c5c87417d8` — two annotations with DISJOINT declared
    // value sets sharing one registered `__theta_respond_<slug>` tool, one
    // QRY-15 instruction and one cached registration. That collision is a
    // consequence of the lowering carrying no information about the argument,
    // and it is a sharper statement of the defect than either row's own bytes:
    // it cannot be satisfied by any emission that keeps dropping the argument.
    const strings = loweredAnnotation("g-collide", 'array<"x" | "y">');
    const numbers = loweredAnnotation("g-collide", "array<1 | 2>");
    expect(
      respondSchemaSlug(numbers),
      `g-collide: schema-subset.md:77 lowers \`items\` by step 3, so a string-literal union ` +
        `(:80) and a number-literal union (the bare-\`enum\` branch) are different fragments and ` +
        `must hash to different names; observed ${JSON.stringify(strings)} and ` +
        `${JSON.stringify(numbers)}`,
    ).not.toBe(respondSchemaSlug(strings));
  });
});
