import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  buildBodyTypeSchemas,
  collectUnresolvedNamedTypes,
  lowerInlineObject,
  lowerTypeSource,
  type SchemaSlugCollision,
} from "../src/parser/body-type-lowering";
import { hoistInlineObjectType, type LowerCtx } from "../src/parser/params";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { respondToolWireSchema } from "../src/runtime/respond-tool-wire";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0039 — an inline object type is recursive by the grammar, and the shared
// body-type lowering handles neither the recursion nor the comma it introduces
// (docs/bugs/0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md).
//
// TWO MECHANISMS, THREE ELEMENTS. The mechanisms are independent and both are
// needed to close any of the elements:
//
//   A. `lowerInlineObject` (src/parser/body-type-lowering.ts:153) splits its
//      interior field list with `splitTopLevel(body, ",")` — the nesting
//      argument omitted, so the default `"angle"` applies (src/parser/params.ts)
//      and `{…}` is not depth. `{a: integer, b: {x: integer, y: string}}` reads
//      as the THREE entries `a: integer`, `b: {x: integer`, `y: string}`.
//      `topLevelColon` does track brace depth, so each truncated entry still
//      yields a field — hence a phantom top-level `y`.
//   B. No lowerer below a root has an inline-object arm. `lowerObjectFields`
//      lowers every field through `lowerTypeSource` (`:79`), whose arms are the
//      literal sublanguage and `lowerTypeExpr`; `lowerTypeExpr` drops a
//      brace-rooted source on its trailing catch-all. A nested inline object
//      therefore lowers `{}` and none of its names is resolved.
//
//   1. THE `@<T>` ANNOTATION ROOT MINTS A WRONG FRAGMENT AND ENFORCES IT.
//      `lowerQueryResponseSchema` (src/runtime/query-schema-lowering.ts:108–113)
//      is the one position where `lowerInlineObject` is the ROOT lowerer, so
//      mechanism A's fragment becomes the response schema QRY-22 validates
//      against and QRY-15 conveys. Groups (a)–(c).
//   2. THE DIAGNOSTIC NAME WALK STOPS ONE LEVEL DOWN.
//      `collectUnresolvedNamedTypes` (`:334`/`:342–345`) resolves through the
//      same two mechanisms, so `theta/parse/unresolved-named-type` is silent at
//      the `@<T>` annotation, the `schema` body field type and the alias/union
//      right-hand side on text the `params:` position raises on. Group (d).
//   3. THE `schema` BODY FIELD AND ALIAS-RHS POSITIONS LOWER `{}`. Those
//      positions never reach `lowerInlineObject` at all, so mechanism B is the
//      whole of the element — permissive-silent, not phantom-wrong, and it
//      holds for a FLAT inline object too. Group (e).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:109 — §Inline object types: `ObjectType` is
//     admitted "in any `Type` position" and the `Type` inside each field is
//     recursive, so a nested inline object is ONE field's type and the comma
//     inside it is not an outer separator.
//   - docs/spec_topics/schema-subset.md:73 — Lowering Algorithm step 2: an
//     inline object appearing in any type position hoists into `$defs` under
//     `__inline_<slug>`, two inline schemas collapsing to one entry exactly
//     when their lowered fragments are byte-identical; `:76` — step 3: a named
//     or inline schema reference emits `{"$ref": "#/$defs/<Name>"}`. No spec
//     text defines the object fragment the annotation root mints today.
//   - :80 — the enum / string-literal-union emission, the literal sublanguage
//     that must survive at depth (not SUBS-1, `:81`, which governs a union of
//     `PrimitiveType` arms; a string-literal union is `LiteralType` arms).
//   - :92–:108 — §Canonical schema hash: the slug recipe used by the oracle
//     below (code-point-sorted object keys, array elements in lowering order,
//     no insignificant whitespace, SHA-256, first 16 lowercase hex characters).
//   - docs/spec_topics/query/query-failure-and-repair.md:78 — QRY-22:
//     validate-then-bind against the declared shape; `:42` — `<schema-json>` is
//     the respond tool's wire schema, so the fragment is also what the model is
//     shown.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:89 — the
//     `theta/parse/unresolved-named-type` row, five positions, error severity.
//     The row already names all five, so this fix needs no registry edit; GOV-15's
//     diagnostic-registry carve-out
//     (docs/spec_topics/governance/source-language-stability.md:25) covers the
//     newly-refused typo inputs.
//   - docs/spec_topics/type-system.md:15 — one type grammar in every annotation
//     position, which is what an author moving a type expression between
//     positions relies on.
//
// PROBED CURRENT SIGNATURES (HEAD 8847de79 / 0.48.0, offline, deterministic,
// byte-identical to the bug doc's §Reproduction tables at 0.45.0 — zero drift).
// `Triage` is declared in every fixture that names it; `Tirage` is declared
// nowhere. `T` abbreviates `{a: integer, b: {x: Tirage, y: string}}`.
//
//   A1 @<{a: integer, b: {x: integer, y: string}}>
//        {"type":"object","properties":{"a":{"type":"integer"},"b":{},"y":{}},
//         "required":["a","b","y"],"additionalProperties":false}
//   A2 @<{a: integer, b: string}>        both fields lowered (correct)
//   A3 payload {"a":1,"b":{"x":1,"y":"s"}}      REJECTED (missing property 'y')
//   A4 payload {"a":1,"b":{"anything":true},"y":"s"}   ACCEPTED
//   D6 respondToolWireSchema over A1     the phantom fragment verbatim
//   F1 {a: integer, b: {x: integer, a: string}}   properties {"a":{},"b":{}}
//                                                 required ["a","b","a"]
//   F2 {a: integer, b: {…}, c: boolean}   required ["a","b","y","c"]
//   F3 two nesting levels                 required ["a","b","q","y"]
//   G1 {a: integer} | {b: integer}        properties {"a":{"anyOf":[{},{}]}}
//   G2 {a: {b: "x" | "y"}}                properties {"a":{"anyOf":[{},{}]}}
//   G3 {a: array<{p: integer}>}           properties {"a":{"type":"array","items":{}}}
//   G4 {a: {}}                            properties {"a":{}}
//   G5 {}                                 properties {} required []
//   G6 {a: {b: Triage}}                   properties {"a":{}}
//   G7 {x: {p: integer, q: boolean}} | {y: string}
//        properties {"x":{},"q":{"anyOf":[{},{}]}}  required ["x","q"]
//   B0 collectUnresolvedNamedTypes(T)     []
//   B1 @<T>                               []          B2 @<{a: integer, b: Tirage}>  ONE error
//   B3 schema S { p: T }                  []          B4 schema S { p: {…Tirage} }   ONE error
//   D1 schema X = T                       []          D2 schema X = {…Tirage}        ONE error
//   D5 @<{a: integer, b: {x: Tirage}}>    []          D3 @<{a: Tirage, b: {…}}>      ONE error
//   B5 params p: "T"                      ONE error `unresolved named type 'Tirage'`
//   C1 params s: S / schema S { p: {a: integer, b: {x: integer, y: string}} }
//        $defs {"S":{…,"properties":{"p":{}},…}}
//   C2 params s: S / schema S { p: {a: integer, b: string} }   BYTE-IDENTICAL to C1
//   C3 params p: "{a: integer, b: {x: integer, y: string}}"    two hoisted defs, correct
//   C5 params s: X / schema X = {a: integer, b: string}        $defs {"X":{}}
//   C6 params s: X / schema X = {a: integer} | {b: integer}    $defs {"X":{"anyOf":[{},{}]}}
//   E1 lowerTypeSource("{x: Tirage, y: string}")    {}  unresolved []
//   E2 lowerTypeSource("{x: Triage}")               {}  unresolved []  defs {}
//   E3 lowerInlineObject("a: integer, b: {x: Tirage, y: string}")  the A1 fragment
//
// WHAT IS RED HERE: groups (a)/(b)/(c) minus their CONTROL rows, group (d)'s
// B0/B1/B3/D1/D5, group (e)'s C1/C2/C5/C6, group (f), group (g), and group
// (h)'s h4 — h4 pins the brace ARM of a balanced segment set hoisting and
// raising, which is part B's own change, so it reds at HEAD exactly as e5 and
// g7 do; h1–h3 are its controls. Every row labelled CONTROL is green now and
// must stay green byte-for-byte — including C3, whose two minted slugs the
// `params:` position's own 37-test lock also pins
// (tests/params-inline-object-lowering.test.ts).
//
// THE PERMISSIVE `{}` FAMILY KEEPS THE MEMBERS §Fix EXCLUDES BY NAME, and their
// controls are what keeps the fix from over-reaching: `array<{…}>` keeps
// `items: {}` because the generic ARGUMENT split stays angle-only
// (src/parser/params.ts:591–612), an unresolved name keeps its `{}`, and a
// LITERAL arm of a mixed union keeps its `{}` (a10, g7). Bug 0039 §Fix
// constraint 1 admits a permissive lowering and forbids a wrong one, so
// converting one of those would be a regression, not an improvement.
//
// A BRACE-ROOTED UNION ARM IS NOT ONE OF THEM. §Fix's "Existing pins that move
// by design" names it: the arm is a `Type` position, so it hoists, and
// `schema X = {a: integer} | {b: integer}` lowers an `anyOf` over two distinct
// `$ref`s (e5, g7). The WHOLE source is still not a single enclosing brace
// group — its first `{` closes at `{a: integer}` — which is what keeps a field
// list from being read off it; the ARMS are, one at a time. The `@<T>`
// annotation root asks the identical `isSingleEnclosingBraceGroup` question of
// the WHOLE annotation before `lowerQueryResponseSchema` ever reaches this
// lowering, and a union of object arms answers false there for the same
// reason it answers false here, so the root falls through to the same split
// and the same per-arm hoist (a9, bug 0053 §Fix). a9b nests one level deeper:
// its first arm carries its own nested object, which hoists in turn, so the
// document closes three `$defs` entries instead of two.
//
// THE SLUG ORACLE IS INDEPENDENT. `schemaSlug` (src/parser/schema-lowering.ts)
// is deliberately NOT imported: an oracle taken from the implementation under
// test proves nothing. Every expected `__inline_<slug>` below is derived from a
// HAND-WRITTEN canonical-form string following the §Canonical schema hash
// recipe, hashed with `node:crypto`. Group (0) keeps those strings honest three
// ways: parse-back equality against the fragment each claims to serialise, a
// whitespace and key-sort check, and — for the recipe as a whole — a
// CROSS-CHECK against two slugs production mints TODAY at the `params:`
// position, one of them from a declaration whose fields are written in
// non-sorted order, so the key sort is exercised end to end rather than
// asserted against itself.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one function call — `parseThetaDocument` over a string, or a direct lowering
// call — plus one real AJV compile of the document that call produces. Nothing
// crosses a session, a child process or a provider, and two of the three
// elements are claims about a diagnostic's PRESENCE or the exact `$defs` bytes,
// neither of which an integration or live tier can observe: a live model cannot
// be asked to prove that a parse raised, and a provider round-trip would add
// stochastic surface to a contract fully determined at the lowering boundary.
// `parseDoc` (tests/helpers/e2e-s1.ts) is the shipped load path wrapped in the
// standard inert `parseDeps` double, and is the harness the bug doc's own
// §Reproduction used.
//
// NO SILENT SKIPPING: every fixture that must load asserts its diagnostic list
// and then fails LOUDLY — diagnostics rendered — if the frontmatter, the params
// block, the lowered schema or the lowered annotation is absent. A refused parse
// or an unlowerable annotation can never be mistaken for a pass.

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

/**
 * The one rendered diagnostic line every position of the row must produce for
 * the nested typo. The `error` prefix is the row's severity column: an
 * error-severity parse diagnostic is what refuses the theta.
 */
function unresolvedLine(name: string): string {
  return `error ${CODE}: ${unresolvedMessage(name)}`;
}

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

// ===========================================================================
// Fragments and their hand-written canonical forms.
//
// Each fragment is step 3's Object emission: `type`, `properties` in DECLARING
// order, `required` over every declared wire name, `additionalProperties: false`.
// Each canonical form is the same value with object keys sorted by Unicode code
// point at every level (`additionalProperties` < `properties` < `required` <
// `type`) and array elements — `required` included — left in lowering order.
// ===========================================================================

/** The closed lowering of `schema Triage { urgent: boolean }`. */
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};

/** `{x: integer, y: string}` — the nested fragment of A1 / F2 / C1 / C3. */
const XY_FRAGMENT = {
  type: "object",
  properties: { x: { type: "integer" }, y: { type: "string" } },
  required: ["x", "y"],
  additionalProperties: false,
};
const XY_CANONICAL =
  '{"additionalProperties":false,"properties":{"x":{"type":"integer"},"y":{"type":"string"}},"required":["x","y"],"type":"object"}';
const XY_INLINE = inlineDefName(XY_CANONICAL);

/** `{a: integer, b: {x: integer, y: string}}` — A1's root, and C1/C3's hoisted outer. */
const A1_BODY = {
  type: "object",
  properties: { a: { type: "integer" }, b: { $ref: `#/$defs/${XY_INLINE}` } },
  required: ["a", "b"],
  additionalProperties: false,
};
const A1_CANONICAL =
  `{"additionalProperties":false,"properties":{"a":{"type":"integer"},` +
  `"b":{"$ref":"#/$defs/${XY_INLINE}"}},"required":["a","b"],"type":"object"}`;
const A1_INLINE = inlineDefName(A1_CANONICAL);

/** `{a: integer, b: string}` — A2's root, and C2/C5's hoisted fragment. */
const FLAT_FRAGMENT = {
  type: "object",
  properties: { a: { type: "integer" }, b: { type: "string" } },
  required: ["a", "b"],
  additionalProperties: false,
};
const FLAT_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"integer"},"b":{"type":"string"}},"required":["a","b"],"type":"object"}';
const FLAT_INLINE = inlineDefName(FLAT_CANONICAL);

/**
 * `{x: integer, a: string}` — F1's nested fragment. Its `a` shares the OUTER
 * field's name, which is what makes today's fragment overwrite the outer `a`
 * and repeat the name in `required`.
 */
const F1_NESTED_FRAGMENT = {
  type: "object",
  properties: { x: { type: "integer" }, a: { type: "string" } },
  required: ["x", "a"],
  additionalProperties: false,
};
const F1_NESTED_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"string"},"x":{"type":"integer"}},"required":["x","a"],"type":"object"}';
const F1_NESTED_INLINE = inlineDefName(F1_NESTED_CANONICAL);

/** `{p: integer, q: integer}` — F3's innermost fragment (two levels down). */
const F3_INNER_FRAGMENT = {
  type: "object",
  properties: { p: { type: "integer" }, q: { type: "integer" } },
  required: ["p", "q"],
  additionalProperties: false,
};
const F3_INNER_CANONICAL =
  '{"additionalProperties":false,"properties":{"p":{"type":"integer"},"q":{"type":"integer"}},"required":["p","q"],"type":"object"}';
const F3_INNER_INLINE = inlineDefName(F3_INNER_CANONICAL);

/** `{x: {p: integer, q: integer}, y: string}` — F3's middle fragment. */
const F3_MID_FRAGMENT = {
  type: "object",
  properties: { x: { $ref: `#/$defs/${F3_INNER_INLINE}` }, y: { type: "string" } },
  required: ["x", "y"],
  additionalProperties: false,
};
const F3_MID_CANONICAL =
  `{"additionalProperties":false,"properties":{"x":{"$ref":"#/$defs/${F3_INNER_INLINE}"},` +
  `"y":{"type":"string"}},"required":["x","y"],"type":"object"}`;
const F3_MID_INLINE = inlineDefName(F3_MID_CANONICAL);

/**
 * `{b: "x" | "y"}` — G2's nested fragment. `b` carries the step-3 emission
 * `schema-subset.md:80` spells for an enum or a string-literal union, which
 * `lowerTypeSource`'s own literal arm produces (group (a)'s LITERAL-ARM control
 * pins those bytes at depth 0), and which the fix must preserve at depth.
 */
const G2_NESTED_FRAGMENT = {
  type: "object",
  properties: { b: { type: "string", enum: ["x", "y"] } },
  required: ["b"],
  additionalProperties: false,
};
const G2_NESTED_CANONICAL =
  '{"additionalProperties":false,"properties":{"b":{"enum":["x","y"],"type":"string"}},"required":["b"],"type":"object"}';
const G2_NESTED_INLINE = inlineDefName(G2_NESTED_CANONICAL);

/** `{b: Triage}` — G6's nested fragment: a DECLARED name one level down. */
const G6_NESTED_FRAGMENT = {
  type: "object",
  properties: { b: { $ref: "#/$defs/Triage" } },
  required: ["b"],
  additionalProperties: false,
};
const G6_NESTED_CANONICAL =
  '{"additionalProperties":false,"properties":{"b":{"$ref":"#/$defs/Triage"}},"required":["b"],"type":"object"}';
const G6_NESTED_INLINE = inlineDefName(G6_NESTED_CANONICAL);

/** `{x: Tirage, y: string}` — E1/E3's nested fragment; `x` is permissive because
 * `Tirage` resolves to nothing, which is the documented unresolved-arm
 * disposition and not part of this bug. */
const E1_FRAGMENT = {
  type: "object",
  properties: { x: {}, y: { type: "string" } },
  required: ["x", "y"],
  additionalProperties: false,
};
const E1_CANONICAL =
  '{"additionalProperties":false,"properties":{"x":{},"y":{"type":"string"}},"required":["x","y"],"type":"object"}';
const E1_INLINE = inlineDefName(E1_CANONICAL);

/** `{x: Triage}` — E2's fragment: one field, a DECLARED name, no interior comma. */
const E2_FRAGMENT = {
  type: "object",
  properties: { x: { $ref: "#/$defs/Triage" } },
  required: ["x"],
  additionalProperties: false,
};
const E2_CANONICAL =
  '{"additionalProperties":false,"properties":{"x":{"$ref":"#/$defs/Triage"}},"required":["x"],"type":"object"}';
const E2_INLINE = inlineDefName(E2_CANONICAL);

/**
 * `{y: integer, x: string}` — the oracle's KEY-SORT cross-check fixture. Its
 * fields are declared in non-sorted order, so the canonical form's `properties`
 * (sorted `x`, `y`) and its `required` (lowering order `["y","x"]`) disagree;
 * production mints this slug today at the `params:` position, so a wrong sort
 * rule in the oracle cannot survive group (0).
 */
const SORT_FRAGMENT = {
  type: "object",
  properties: { y: { type: "integer" }, x: { type: "string" } },
  required: ["y", "x"],
  additionalProperties: false,
};
const SORT_CANONICAL =
  '{"additionalProperties":false,"properties":{"x":{"type":"string"},"y":{"type":"integer"}},"required":["y","x"],"type":"object"}';
const SORT_INLINE = inlineDefName(SORT_CANONICAL);

/** `{a: integer}` — the FIRST arm of e5's union, and the shape group (g) mints. */
const A_INT_FRAGMENT = {
  type: "object",
  properties: { a: { type: "integer" } },
  required: ["a"],
  additionalProperties: false,
};
const A_INT_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"integer"}},"required":["a"],"type":"object"}';
const A_INT_SLUG = slugOfCanonicalForm(A_INT_CANONICAL);
const A_INT_INLINE = inlineDefName(A_INT_CANONICAL);

/** `{b: integer}` — the SECOND arm of e5's union, distinct from the first. */
const B_INT_FRAGMENT = {
  type: "object",
  properties: { b: { type: "integer" } },
  required: ["b"],
  additionalProperties: false,
};
const B_INT_CANONICAL =
  '{"additionalProperties":false,"properties":{"b":{"type":"integer"}},"required":["b"],"type":"object"}';
const B_INT_INLINE = inlineDefName(B_INT_CANONICAL);

/** `{ a: string }` — the brace ARM of the alias-RHS union group (g) closes. */
const A_STR_FRAGMENT = {
  type: "object",
  properties: { a: { type: "string" } },
  required: ["a"],
  additionalProperties: false,
};
const A_STR_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"string"}},"required":["a"],"type":"object"}';
const A_STR_INLINE = inlineDefName(A_STR_CANONICAL);

/**
 * `{ a: Ghost }` — the fragment group (h)'s BALANCED-set neighbour hoists. `a`
 * is permissive because `Ghost` resolves to nothing, which is the documented
 * unresolved-arm disposition; what the fixture reads off this fragment is that
 * the arm hoisted AT ALL, so the name one brace deeper reached the walk.
 */
const A_GHOST_FRAGMENT = {
  type: "object",
  properties: { a: {} },
  required: ["a"],
  additionalProperties: false,
};
const A_GHOST_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{}},"required":["a"],"type":"object"}';
const A_GHOST_INLINE = inlineDefName(A_GHOST_CANONICAL);

/** `{p: integer, q: boolean}` — a9b/G7's innermost fragment, one level down. */
const PQ_FRAGMENT = {
  type: "object",
  properties: { p: { type: "integer" }, q: { type: "boolean" } },
  required: ["p", "q"],
  additionalProperties: false,
};
const PQ_CANONICAL =
  '{"additionalProperties":false,"properties":{"p":{"type":"integer"},"q":{"type":"boolean"}},"required":["p","q"],"type":"object"}';
const PQ_INLINE = inlineDefName(PQ_CANONICAL);

/** `{x: {p: integer, q: boolean}}` — a9b/G7's FIRST arm, itself carrying a hoist. */
const X_PQ_FRAGMENT = {
  type: "object",
  properties: { x: { $ref: `#/$defs/${PQ_INLINE}` } },
  required: ["x"],
  additionalProperties: false,
};
const X_PQ_CANONICAL =
  `{"additionalProperties":false,"properties":{"x":{"$ref":"#/$defs/${PQ_INLINE}"}},` +
  `"required":["x"],"type":"object"}`;
const X_PQ_INLINE = inlineDefName(X_PQ_CANONICAL);

/** `{y: string}` — a9b/G7's SECOND arm. */
const Y_STR_FRAGMENT = {
  type: "object",
  properties: { y: { type: "string" } },
  required: ["y"],
  additionalProperties: false,
};
const Y_STR_CANONICAL =
  '{"additionalProperties":false,"properties":{"y":{"type":"string"}},"required":["y"],"type":"object"}';
const Y_STR_INLINE = inlineDefName(Y_STR_CANONICAL);

// ===========================================================================
// Fixtures and load helpers. Loud on every unexpected disposition.
// ===========================================================================

/** `Triage` is declared in every fixture; `Tirage` is declared nowhere. */
const TRIAGE_BODY = "schema Triage { urgent: boolean }\n";

/** The nested-typo type expression the registry row's five positions share. */
const NESTED_TYPO = "{a: integer, b: {x: Tirage, y: string}}";

/** A `mode: prompt` theta with no `params:` block and the given body. */
function bodySrc(body: string): string {
  return `---\nmode: prompt\n---\n${body}`;
}

/** A `mode: prompt` theta whose `params:` block is `paramsBlock`. */
function paramsSrc(paramsBlock: string, body: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${body}`;
}

/** A body carrying a typed query whose annotation is `annotation`. */
function annotationBody(annotation: string): string {
  return `${TRIAGE_BODY}let r = @<${annotation}>\`x\`\nr\n`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * The `schema` declarations of a body that must load cleanly — the input
 * `lowerQueryResponseSchema` takes, built the way the shipped producer builds
 * it (`schemaDeclsOf`, production-theta-producer.ts). A body that fails to load
 * throws with its diagnostics rendered, so a broken fixture never reads as a
 * lowering result.
 */
function schemaDeclsOf(body: string): readonly SchemaDecl[] {
  const doc = parseDoc(bodySrc(body), "bug0039.theta");
  if (doc.diagnostics.length > 0) {
    throw new Error(
      `harness: the decl body must load cleanly, but produced ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The `schema Triage { urgent: boolean }` declaration set every annotation resolves against. */
const TRIAGE_DECLS = schemaDeclsOf(`${TRIAGE_BODY}let x = 1\n`);

/**
 * The lowered response schema for an inline annotation, or a loud failure.
 * `undefined` is reserved for the EMPTY annotation alone, so it is a harness
 * error here rather than a fixture outcome.
 */
function loweredAnnotation(label: string, annotation: string): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, TRIAGE_DECLS);
  if (lowered === undefined) {
    throw new Error(
      `${label}: \`@<${annotation}>\` lowered to nothing, so QRY-22 would bind an UNVALIDATED response; only the empty annotation may lower to undefined`,
    );
  }
  return lowered;
}

/** A parsed, cleanly-lowered `params:` block. */
interface LoadedParams {
  readonly properties: Record<string, unknown>;
  readonly defs: Record<string, unknown>;
  readonly loweredSchema: LoweredSchema;
}

/**
 * Parse a fixture that must LOAD, and read its lowered `params:` schema back.
 * Every absent intermediate — a `null` frontmatter, an absent `params`, an
 * absent `loweredSchema` — throws with the diagnostics rendered.
 */
function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0039.theta");
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
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  return {
    properties: properties as Record<string, unknown>,
    defs: (lowered["$defs"] ?? {}) as Record<string, unknown>,
    loweredSchema: lowered,
  };
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
 * Every `$ref` in a document resolves against the DOCUMENT ROOT's `$defs` —
 * the property `buildBodyTypeSchemas`'s pass 3 and `pruneDocumentDefs` exist to
 * maintain. A hoisted `__inline_<slug>` name has no `bodies` entry, so a mint at
 * the body-field or alias-RHS position that skips those closures leaves a
 * dangling pointer AJV refuses with `MissingRefError`; this check names the
 * missing entry before the compile does.
 */
function expectRefsClosed(label: string, document: LoweredSchema): void {
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  const missing = [...new Set(refNames(document))].filter((name) => !(name in defs));
  expect(
    missing,
    `${label}: every \`#/$defs/<name>\` pointer must have a fragment at the document root, or AJV refuses the whole document with MissingRefError; document=${JSON.stringify(document)}`,
  ).toEqual([]);
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
    `${label}: §Canonical schema hash step 2 (:100) sorts object keys by Unicode code point; keys at ${path} are ${JSON.stringify(keys)}`,
  ).toEqual([...keys].sort(compareCodePoint));
  for (const key of keys) {
    assertKeysSorted(label, (value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

describe("bug 0039 (0) — the independent slug oracle", () => {
  const cases: ReadonlyArray<readonly [string, string, unknown]> = [
    ["`{x: integer, y: string}`", XY_CANONICAL, XY_FRAGMENT],
    ["`{a: integer, b: {x: integer, y: string}}`", A1_CANONICAL, A1_BODY],
    ["`{a: integer, b: string}`", FLAT_CANONICAL, FLAT_FRAGMENT],
    ["F1 nested `{x: integer, a: string}`", F1_NESTED_CANONICAL, F1_NESTED_FRAGMENT],
    ["F3 inner `{p: integer, q: integer}`", F3_INNER_CANONICAL, F3_INNER_FRAGMENT],
    ["F3 mid `{x: {p: integer, q: integer}, y: string}`", F3_MID_CANONICAL, F3_MID_FRAGMENT],
    ['G2 nested `{b: "x" | "y"}`', G2_NESTED_CANONICAL, G2_NESTED_FRAGMENT],
    ["G6 nested `{b: Triage}`", G6_NESTED_CANONICAL, G6_NESTED_FRAGMENT],
    ["E1 `{x: Tirage, y: string}`", E1_CANONICAL, E1_FRAGMENT],
    ["E2 `{x: Triage}`", E2_CANONICAL, E2_FRAGMENT],
    ["SORT `{y: integer, x: string}`", SORT_CANONICAL, SORT_FRAGMENT],
    ["`{a: integer}`", A_INT_CANONICAL, A_INT_FRAGMENT],
    ["`{b: integer}`", B_INT_CANONICAL, B_INT_FRAGMENT],
    ["`{a: string}`", A_STR_CANONICAL, A_STR_FRAGMENT],
    ["`{a: Ghost}` (permissive `a`)", A_GHOST_CANONICAL, A_GHOST_FRAGMENT],
    ["G7 inner `{p: integer, q: boolean}`", PQ_CANONICAL, PQ_FRAGMENT],
    ["G7 first arm `{x: {p: integer, q: boolean}}`", X_PQ_CANONICAL, X_PQ_FRAGMENT],
    ["G7 second arm `{y: string}`", Y_STR_CANONICAL, Y_STR_FRAGMENT],
  ];

  for (const [label, canonical, fragment] of cases) {
    it(`ORACLE: the hand-written canonical form for ${label} is faithful, whitespace-free and key-sorted`, () => {
      expect(
        JSON.parse(canonical),
        `${label}: the hand-written canonical form must parse back to the lowered fragment it hashes`,
      ).toEqual(fragment);
      expect(
        canonical,
        `${label}: §Canonical schema hash step 2 (:101) forbids insignificant whitespace, and no key or value here contains a space; observed ${canonical}`,
      ).not.toMatch(/\s/);
      assertKeysSorted(label, JSON.parse(canonical));
    });
  }

  it("ORACLE: each derived slug is 16 lowercase hex characters and each def name is `__inline_<slug>`", () => {
    for (const [label, canonical] of cases) {
      const slug = slugOfCanonicalForm(canonical);
      expect(
        slug,
        `${label}: §Canonical schema hash step 4 (:107) — the first 16 hex characters of the SHA-256 digest, lowercased; observed ${slug}`,
      ).toMatch(/^[0-9a-f]{16}$/);
      expect(
        inlineDefName(canonical),
        `${label}: step 2 (:73) and §Synthesised names (:108) — the hoisted key is \`__inline_<slug>\``,
      ).toBe(`__inline_${slug}`);
    }
    const slugs = cases.map(([, canonical]) => slugOfCanonicalForm(canonical));
    expect(
      new Set(slugs).size,
      `every distinct fragment must produce a distinct slug, or a dedup claim below would be vacuous; observed ${JSON.stringify(slugs)}`,
    ).toBe(cases.length);
  });

  it("ORACLE CROSS-CHECK: the recipe reproduces two slugs production mints TODAY at the `params:` position", () => {
    // The `params:` right-hand side already hoists inline objects (bug 0035's
    // fix), so its minted names are an end-to-end witness of the same recipe,
    // taken from production rather than from `schemaSlug` directly. The SORT
    // fixture is what exercises the key sort: its fields are declared `y` then
    // `x`, so a recipe that left `properties` in declaring order — or that
    // sorted `required` — would mint a different name.
    const nested = loadCleanly(
      "CROSS-CHECK C3",
      paramsSrc(`  p: "{a: integer, b: {x: integer, y: string}}"`, `${TRIAGE_BODY}let x = 1\n`),
    );
    expect(
      Object.keys(nested.defs).sort(),
      `the two names the \`params:\` position mints for this declaration must be the two the oracle derives; observed ${JSON.stringify(Object.keys(nested.defs))}`,
    ).toEqual([A1_INLINE, XY_INLINE].sort());

    const sorted = loadCleanly(
      "CROSS-CHECK SORT",
      paramsSrc(`  p: "{y: integer, x: string}"`, `${TRIAGE_BODY}let x = 1\n`),
    );
    expect(
      Object.keys(sorted.defs),
      `a declaration whose fields are NOT in code-point order pins the sort rule; observed ${JSON.stringify(Object.keys(sorted.defs))}`,
    ).toEqual([SORT_INLINE]);
    expect(
      sorted.defs[SORT_INLINE],
      "the hoisted fragment keeps DECLARING order in `properties` and `required`; only the canonical form used for hashing sorts keys",
    ).toEqual(SORT_FRAGMENT);
  });
});

// ===========================================================================
// (a) ELEMENT 1 — the `@<T>` annotation root. `lowerInlineObject` is the ROOT
// lowerer here, so its fragment IS the response schema.
// RED at HEAD: A1/F1/F2/F3 carry phantom top-level fields; G2/G6 lower `{}` one
// level down.
// ===========================================================================

describe("bug 0039 (a) — a nested inline object at the `@<T>` annotation root hoists instead of leaking fields", () => {
  it("RED (a1, fixture A1): `@<{a: integer, b: {x: integer, y: string}}>` lowers TWO root fields, `b` a $ref, no phantom `y`", () => {
    // The defect in one line: the interior split does not track brace depth, so
    // the nested object's second field becomes a THIRD root field. The expected
    // shape is the one the `params:` position lowers for byte-identical text
    // (fixture C3, cross-checked in group (0)): the same nested fragment under
    // the same minted name.
    const lowered = loweredAnnotation("A1", "{a: integer, b: {x: integer, y: string}}");
    expect(
      lowered,
      `schema-subset.md:73/:76 — the nested inline object hoists under ${XY_INLINE} and the enclosing field emits a $ref to it; no \`properties\` key and no \`required\` entry may name a field the author did not write at THIS level; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ ...A1_BODY, $defs: { [XY_INLINE]: XY_FRAGMENT } });
    expect(
      lowered["required"],
      `exactly the two field names declared at the root; a third entry is the nested field list leaking outward; observed ${JSON.stringify(lowered["required"])}`,
    ).toEqual(["a", "b"]);
    expectRefsClosed("A1", lowered);
  });

  it("RED (a2, fixture F1): a nested field name colliding with an outer one overwrites neither field nor `required`", () => {
    // `{a: integer, b: {x: integer, a: string}}`. Today the truncated third
    // entry is named `a`, so the outer `a`'s `{"type":"integer"}` is replaced by
    // a permissive `{}` and `required` carries `a` twice — bug 0039 §Fix
    // constraint 1 forbids both outcomes by name.
    const lowered = loweredAnnotation("F1", "{a: integer, b: {x: integer, a: string}}");
    expect(
      lowered,
      `the outer \`a\` keeps its own lowered type and the nested \`a\` lives inside the hoisted fragment ${F1_NESTED_INLINE}; observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { a: { type: "integer" }, b: { $ref: `#/$defs/${F1_NESTED_INLINE}` } },
      required: ["a", "b"],
      additionalProperties: false,
      $defs: { [F1_NESTED_INLINE]: F1_NESTED_FRAGMENT },
    });
    const required = lowered["required"] as readonly string[];
    expect(
      new Set(required).size,
      `bug 0039 §Fix constraint 1: no \`required\` list may repeat a name; observed ${JSON.stringify(required)}`,
    ).toBe(required.length);
  });

  it("RED (a3, fixture F2): a declared field AFTER the nested one keeps its position and its lowering", () => {
    // `{a: integer, b: {x: integer, y: string}, c: boolean}` — the phantom is
    // spliced BETWEEN `b` and `c` today, so this bounds the damage to the
    // nested list rather than to the tail of the outer one.
    const lowered = loweredAnnotation("F2", "{a: integer, b: {x: integer, y: string}, c: boolean}");
    expect(
      lowered,
      `three declared root fields in declaring order, `
        + `\`b\` a $ref to ${XY_INLINE}; observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: {
        a: { type: "integer" },
        b: { $ref: `#/$defs/${XY_INLINE}` },
        c: { type: "boolean" },
      },
      required: ["a", "b", "c"],
      additionalProperties: false,
      $defs: { [XY_INLINE]: XY_FRAGMENT },
    });
  });

  it("RED (a4, fixture F3): TWO levels of nesting hoist two fragments and leak nothing", () => {
    // `{a: integer, b: {x: {p: integer, q: integer}, y: string}}`. Today the
    // second level leaks `q` to the root alongside `y`, so the depth-2 case
    // proves the recursion, not only the split.
    const lowered = loweredAnnotation(
      "F3",
      "{a: integer, b: {x: {p: integer, q: integer}, y: string}}",
    );
    expect(
      lowered,
      `grammar.md:109 makes each field's \`Type\` recursive, so each level hoists its own \`__inline_\` fragment and the root still declares exactly \`a\` and \`b\`; observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { a: { type: "integer" }, b: { $ref: `#/$defs/${F3_MID_INLINE}` } },
      required: ["a", "b"],
      additionalProperties: false,
      $defs: { [F3_MID_INLINE]: F3_MID_FRAGMENT, [F3_INNER_INLINE]: F3_INNER_FRAGMENT },
    });
    expectRefsClosed("F3", lowered);
  });

  it("RED (a5, fixture G2): the `schema-subset.md:80` literal sublanguage survives one level down", () => {
    // `{a: {b: "x" | "y"}}` has no interior comma at the outer level, so this
    // reds on mechanism B alone. It is also the constraint bug 0039 §Fix states
    // on the recursion: the arm must recurse through `lowerTypeSource`, whose
    // literal handling lives above `lowerTypeExpr` — recursing through
    // `lowerTypeExpr` instead would lower `b` to `anyOf: [{}, {}]`, which is
    // what the whole annotation lowers to today.
    const lowered = loweredAnnotation("G2", '{a: {b: "x" | "y"}}');
    expect(
      lowered,
      `schema-subset.md:80 — a string-literal union lowers to the enum form at every depth; observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { a: { $ref: `#/$defs/${G2_NESTED_INLINE}` } },
      required: ["a"],
      additionalProperties: false,
      $defs: { [G2_NESTED_INLINE]: G2_NESTED_FRAGMENT },
    });
  });

  it("RED (a6, fixture G6): a DECLARED name one level down resolves to its `$ref` and its fragment is reachable", () => {
    // `{a: {b: Triage}}` — the annotation-root twin of fixture E2, the sharpest
    // statement of mechanism B: no comma, no typo, a name that resolves, and
    // the whole nested object still lowers `{}` today.
    const lowered = loweredAnnotation("G6", "{a: {b: Triage}}");
    expect(
      lowered,
      `schema-subset.md:76 — a named schema reference one level down emits \`#/$defs/Triage\`, and \`pruneDocumentDefs\` must retain the fragment it names; observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { a: { $ref: `#/$defs/${G6_NESTED_INLINE}` } },
      required: ["a"],
      additionalProperties: false,
      $defs: { [G6_NESTED_INLINE]: G6_NESTED_FRAGMENT, Triage: TRIAGE_DEF },
    });
    expectRefsClosed("G6", lowered);
  });

  it("CONTROL (a7, fixture A2): a FLAT inline annotation is already correct and must not move", () => {
    // The bound on element 1: single-level inline objects lower both fields
    // today. A fix that hoisted the ROOT as well would red here, and the root
    // is an object at this position precisely because the annotation IS the
    // response schema.
    const lowered = loweredAnnotation("A2", "{a: integer, b: string}");
    expect(
      lowered,
      `bug 0039 §Affected "Not affected": single-level inline objects at every position; observed ${JSON.stringify(lowered)}`,
    ).toEqual(FLAT_FRAGMENT);
  });

  it("CONTROL (a8, fixtures G3/G4/G5): the permissive dispositions bug 0039 §Expected leaves unchanged", () => {
    // `array<{…}>`'s `{}` is load-bearing: the generic ARGUMENT split stays
    // angle-only (params.ts:591–612), so a two-field element type presents as
    // two arguments and the `array` arm does not match at all. Widening it
    // would break `theta/parse/generic-arity-mismatch` agreement.
    const generic = loweredAnnotation("G3", "{a: array<{p: integer}>}");
    expect(
      generic,
      `bug 0039 §Expected: \`array<{…}>\` keeps its permissive \`items: {}\`; observed ${JSON.stringify(generic)}`,
    ).toEqual({
      type: "object",
      properties: { a: { type: "array", items: {} } },
      required: ["a"],
      additionalProperties: false,
    });

    // grammar.md:109's `empty-schema-body` rule now refuses an empty inline
    // object at parse time, at every position and every nesting depth (bug
    // 0045 §Fix), so a LOADING theta never reaches this lowering. This cell
    // drives `lowerQueryResponseSchema` directly, below the parse seam, so it
    // still exercises the unchanged unreachable-defence-in-depth arm and its
    // assertions stay exactly as pinned.
    const nestedEmpty = loweredAnnotation("G4", "{a: {}}");
    expect(
      nestedEmpty,
      `bug 0039 §Expected: an empty inline \`{}\` keeps its current permissive disposition; observed ${JSON.stringify(nestedEmpty)}`,
    ).toEqual({
      type: "object",
      properties: { a: {} },
      required: ["a"],
      additionalProperties: false,
    });

    const rootEmpty = loweredAnnotation("G5", "{}");
    expect(
      rootEmpty,
      `the empty annotation root is unchanged; observed ${JSON.stringify(rootEmpty)}`,
    ).toEqual({ type: "object", properties: {}, required: [], additionalProperties: false });
  });

  it("a9 (fixture G1): the ROOT brace dispatch hoists a mixed union of object arms instead of reading it as one field list", () => {
    // `{a: integer} | {b: integer}` opens with `{` and closes with `}`, but its
    // index-0 `{` closes at `{a: integer}`, well short of the source's end —
    // it is NOT a single enclosing brace group. `isSingleEnclosingBraceGroup`
    // (body-type-lowering.ts) answers false, so the annotation root's own
    // guard (query-schema-lowering.ts) falls through to `lowerTypeSource`
    // exactly as every other brace-rooted position does (bug 0053 §Fix).
    // `lowerTypeSource` splits the union, hoists each object arm under its own
    // `__inline_<slug>` and combines them with `anyOf` (schema-subset.md:81),
    // so the root declares no `required` property at all — `required` belongs
    // to each arm's own fragment, not to the union. `e5` pins the identical
    // union at the alias RHS to the same two fragments; the root and the alias
    // now lower one type expression identically, as type-system.md:15 states.
    const lowered = loweredAnnotation("G1", "{a: integer} | {b: integer}");
    expect(
      lowered,
      `schema-subset.md:81 (SUBS-1) — a union with a non-primitive arm lowers to \`anyOf\`, both arms hoisted (bug 0053 §Fix); observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      anyOf: [{ $ref: `#/$defs/${A_INT_INLINE}` }, { $ref: `#/$defs/${B_INT_INLINE}` }],
      $defs: { [A_INT_INLINE]: A_INT_FRAGMENT, [B_INT_INLINE]: B_INT_FRAGMENT },
    });
  });

  it("a9b (fixture G7): the ROOT brace dispatch hoists an arm carrying its own nested object, transitively", () => {
    // One nesting level deeper than a9.
    // `{x: {p: integer, q: boolean}} | {y: string}` is not a single enclosing
    // brace group either, so the identical guard falls through to
    // `lowerTypeSource` and the union splits into its two arms (bug 0053
    // §Fix). The first arm, `{x: {p: integer, q: boolean}}`, is itself a
    // single enclosing brace group, so its own nested object hoists one level
    // down before the arm's own fragment hoists in turn — the document closes
    // three `$defs` entries: the two arms and the arm's nested fragment.
    const lowered = loweredAnnotation("G7", "{x: {p: integer, q: boolean}} | {y: string}");
    expect(
      lowered,
      `schema-subset.md:73 hoists an inline object at ANY depth, so the arm's own nested object hoists with it (bug 0053 §Fix); observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      anyOf: [{ $ref: `#/$defs/${X_PQ_INLINE}` }, { $ref: `#/$defs/${Y_STR_INLINE}` }],
      $defs: {
        [PQ_INLINE]: PQ_FRAGMENT,
        [X_PQ_INLINE]: X_PQ_FRAGMENT,
        [Y_STR_INLINE]: Y_STR_FRAGMENT,
      },
    });
  });

  it("CONTROL (a10, LITERAL-ARM): `lowerTypeSource`'s literal-union emission at depth 0 is the bytes a5 pins at depth 1", () => {
    // a5's expected fragment — and therefore its minted slug — is a function of
    // this arm's output. Pinning it here means a change to the literal emission
    // (schema-subset.md:80 spells the enum form with a `type`) reds as ITSELF
    // rather than as a mysterious slug mismatch in a5.
    const unresolved: string[] = [];
    const lowered = lowerTypeSource(
      '"x" | "y"',
      new Map<string, Record<string, unknown>>(),
      {},
      unresolved,
    );
    expect(
      lowered,
      `body-type-lowering.ts:378–392 owns the literal sublanguage, and schema-subset.md:80 spells its multi-arm emission; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ type: "string", enum: ["x", "y"] });
    expect(unresolved, "a literal union names no type").toEqual([]);
  });
});

// ===========================================================================
// (b) QRY-22 — the consequence at the response boundary, through the production
// `AjvSchemaValidator` over the document the annotation lowering produced.
// RED at HEAD: A3 (the author's own payload) fails and A4 (the phantom shape)
// passes — probed, both inverted.
// ===========================================================================

describe("bug 0039 (b) — the lowered annotation validates the shape the author declared", () => {
  it("RED (b1, fixtures A3/A4): the conformant payload validates and the phantom shape does not", () => {
    const lowered = loweredAnnotation("A1", "{a: integer, b: {x: integer, y: string}}");
    const { validator, emitted } = ajv();
    const compiled = validator.compile(lowered);

    const conformant = compiled.validate({ a: 1, b: { x: 1, y: "s" } });
    expect(
      conformant.ok,
      `QRY-22 (query-failure-and-repair.md:78): the reply the author's own declaration describes must validate. Today the minted fragment requires a TOP-LEVEL \`y\` that declaration never mentions, so the author's conformant reply is refused and QRY-11 repair drives the model towards a shape the theta cannot bind; observed ${JSON.stringify(conformant)}`,
    ).toBe(true);

    const phantom = compiled.validate({ a: 1, b: { anything: true }, y: "s" });
    expect(
      phantom.ok,
      `the phantom shape — an unconstrained \`b\` beside a top-level \`y\` — is what the angle-only split's fragment accepts, and it is not the declared type; observed ${JSON.stringify(phantom)}`,
    ).toBe(false);

    const missingNested = compiled.validate({ a: 1, b: { x: 1 } });
    expect(
      missingNested.ok,
      `every wire name of the nested fragment is required, \`y\` included (schema-subset.md step 3's Object emission); observed ${JSON.stringify(missingNested)}`,
    ).toBe(false);

    const extraNested = compiled.validate({ a: 1, b: { x: 1, y: "s", z: 0 } });
    expect(
      extraNested.ok,
      `\`additionalProperties: false\` on the nested hoisted fragment; observed ${JSON.stringify(extraNested)}`,
    ).toBe(false);

    expect(
      emitted.map((d) => d.code),
      `no validator diagnostic: one compile of one document; observed ${JSON.stringify(emitted)}`,
    ).toEqual([]);
  });

  it("CONTROL (b2, fixture A2): the flat annotation already enforces both of its fields", () => {
    const lowered = loweredAnnotation("A2", "{a: integer, b: string}");
    const compiled = ajv().validator.compile(lowered);
    const good = compiled.validate({ a: 1, b: "s" });
    expect(good.ok, `the declared payload validates; observed ${JSON.stringify(good)}`).toBe(true);
    const bad = compiled.validate({ a: 1, b: 2 });
    expect(bad.ok, `a wrong field type is refused; observed ${JSON.stringify(bad)}`).toBe(false);
  });
});

// ===========================================================================
// (c) THE WIRE SHAPE — QRY-15 conveys the lowered schema to the model verbatim
// for an object root (respond-tool-wire.ts:91), so the phantom fragment is also
// what the model is instructed to produce on every repair turn.
// RED at HEAD: the wire schema is the phantom fragment.
// ===========================================================================

describe("bug 0039 (c) — the respond tool's wire schema carries the corrected shape", () => {
  it("RED (c1, fixture D6): `respondToolWireSchema` over the A1 lowering shows the model two root fields", () => {
    const lowered = loweredAnnotation("A1", "{a: integer, b: {x: integer, y: string}}");
    const wire = respondToolWireSchema(lowered);
    expect(
      wire,
      `query-failure-and-repair.md:42 — \`<schema-json>\` IS the respond tool's wire schema, and an object root is registered verbatim, so a phantom \`properties\` key is also the instruction the model repairs towards; observed ${JSON.stringify(wire)}`,
    ).toEqual(lowered);
    expect(
      (wire["properties"] ?? {}) as Record<string, unknown>,
      `the model must be shown exactly the two fields the author declared; observed ${JSON.stringify(wire["properties"])}`,
    ).toEqual({ a: { type: "integer" }, b: { $ref: `#/$defs/${XY_INLINE}` } });
  });
});

// ===========================================================================
// (d) ELEMENT 2 — the diagnostic name walk, over the real load path.
// RED at HEAD: B0/B1/B3/D1/D5 raise nothing on text B5 raises on.
// ===========================================================================

describe("bug 0039 (d) — a name inside a NESTED inline object raises unresolved-named-type at every position of the row", () => {
  /** The single rendered line every position must produce for the nested typo. */
  const EXPECTED = [unresolvedLine("Tirage")];

  it("CONTROL (d0, fixtures B2/B4/D2/D3/B5): the four positions already raise on text one level shallower", () => {
    // Asserted FIRST so a red below names the defect rather than a broken
    // control. B2/B4/D2 put the typo at the OUTER level; D3 bounds the loss to
    // depth by putting an outer-level typo BESIDE a nested sibling; B5 is the
    // `params:` position on the full nested text, and is the reference bytes.
    const rows: ReadonlyArray<readonly [string, string]> = [
      ["B2 — the `@<T>` annotation, typo at the outer level", bodySrc(annotationBody("{a: integer, b: Tirage}"))],
      [
        "B4 — a `schema` body field type, typo at the outer level",
        bodySrc(`${TRIAGE_BODY}schema S { p: {a: integer, b: Tirage} }\nlet x = 1\n`),
      ],
      [
        "D2 — the alias/union RHS, typo at the outer level",
        bodySrc(`${TRIAGE_BODY}schema X = {a: integer, b: Tirage}\nlet x = 1\n`),
      ],
      [
        "D3 — an outer-level typo BESIDE a nested sibling still raises",
        bodySrc(annotationBody("{a: Tirage, b: {x: integer, y: string}}")),
      ],
      [
        "B5 — the `params:` position on the NESTED text (bug 0035's fix, 0.44.0)",
        paramsSrc(`  p: "${NESTED_TYPO}"`, `${TRIAGE_BODY}let x = 1\n`),
      ],
    ];
    for (const [label, source] of rows) {
      const doc = parseDoc(source, "bug0039.theta");
      expect(
        diagLines(doc),
        `${label}: code-registry-parse.md:89 lists this position, at error severity; observed ${JSON.stringify(diagLines(doc))}`,
      ).toEqual(EXPECTED);
    }
  });

  it("RED (d1, fixture B0): `collectUnresolvedNamedTypes` walks INTO the nested object", () => {
    // The walker under both mechanisms: it dispatches the brace-rooted source to
    // `lowerInlineObject` (truncating the entries) and everything else to
    // `lowerTypeSource` (which stops at the nested brace), then discards the
    // fragment and returns only names. All three production call sites read
    // this list.
    const names = collectUnresolvedNamedTypes(NESTED_TYPO, new Set(["Triage"]));
    expect(
      names,
      `bug 0028 §Fix's walker resolves through the same two mechanisms it is asked to see past; observed ${JSON.stringify(names)}`,
    ).toEqual(["Tirage"]);
  });

  it("RED (d2, fixture B1): the `@<T>` query annotation raises, byte-identical to the `params:` position", () => {
    const doc = parseDoc(bodySrc(annotationBody(NESTED_TYPO)), "bug0039.theta");
    expect(
      diagLines(doc),
      `type-system.md:15 — one type grammar in every annotation position; \`${NESTED_TYPO}\` must render at \`@<T>\` exactly what it renders under \`params:\` (fixture B5); observed ${JSON.stringify(diagLines(doc))}`,
    ).toEqual(EXPECTED);
  });

  it("RED (d3, fixture B3): a `schema` body field type raises, byte-identical to the `params:` position", () => {
    const doc = parseDoc(
      bodySrc(`${TRIAGE_BODY}schema S { p: ${NESTED_TYPO} }\nlet x = 1\n`),
      "bug0039.theta",
    );
    expect(
      diagLines(doc),
      `code-registry-parse.md:89 position 3; observed ${JSON.stringify(diagLines(doc))}`,
    ).toEqual(EXPECTED);
  });

  it("RED (d4, fixture D1): the `schema X = …` alias RHS raises, byte-identical to the `params:` position", () => {
    const doc = parseDoc(
      bodySrc(`${TRIAGE_BODY}schema X = ${NESTED_TYPO}\nlet x = 1\n`),
      "bug0039.theta",
    );
    expect(
      diagLines(doc),
      `code-registry-parse.md:89 position 4, added by bug 0033; observed ${JSON.stringify(diagLines(doc))}`,
    ).toEqual(EXPECTED);
  });

  it("RED (d5, fixture D5): a nested object with ONE field and no interior comma still raises", () => {
    // Mechanism B in isolation at the annotation position: nothing here can be
    // blamed on the interior split, so part A alone cannot close it.
    const doc = parseDoc(bodySrc(annotationBody("{a: integer, b: {x: Tirage}}")), "bug0039.theta");
    expect(
      diagLines(doc),
      `the nested object carries no comma, so this row isolates the missing inline-object arm from the interior split; observed ${JSON.stringify(diagLines(doc))}`,
    ).toEqual(EXPECTED);
  });

  it("CONTROL (d6, fixture C4): the well-formed nested annotation still loads with NO diagnostic", () => {
    // The other half of the raise contract: the fix must not refuse the
    // CORRECT nested declaration while it starts refusing the typo'd one.
    const doc = parseDoc(
      bodySrc(annotationBody("{a: integer, b: {x: integer, y: string}}")),
      "bug0039.theta",
    );
    expect(
      diagLines(doc),
      `grammar.md:109 admits this declaration, so it must keep loading clean; observed ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (e) ELEMENT 3 — the `schema` body field and alias-RHS positions, read off the
// lowered `params:` schema of a field naming the declaration.
// RED at HEAD: C1 and C2 are BYTE-IDENTICAL (`properties.p = {}` for a nested
// and a flat inline object alike), and C5's alias lowers `$defs.X = {}`.
// ===========================================================================

describe("bug 0039 (e) — an inline object as a `schema` body field type or an alias RHS hoists instead of lowering `{}`", () => {
  it("RED (e1, fixture C1): a NESTED inline object field lowers a $ref whose fragment closes the document", () => {
    const loaded = loadCleanly(
      "C1",
      paramsSrc(
        "  s: S",
        `${TRIAGE_BODY}schema S { p: {a: integer, b: {x: integer, y: string}} }\nlet x = 1\n`,
      ),
    );
    const S = loaded.defs["S"] as Record<string, unknown>;
    expect(
      (S["properties"] ?? {}) as Record<string, unknown>,
      `schema-subset.md:73 step 2 hoists an inline object in ANY type position, and :76 emits the $ref; \`lowerObjectFields\` lowers each field through \`lowerTypeSource\`, which has no inline-object arm at HEAD; observed ${JSON.stringify(S["properties"])}`,
    ).toEqual({ p: { $ref: `#/$defs/${A1_INLINE}` } });
    expectRefsClosed("C1", loaded.loweredSchema);

    // `buildBodyTypeSchemas`'s pass 3 rebuilds each name's closure by looking it
    // up in `bodies`, where an `__inline_<slug>` name has no entry — so the
    // compile is what proves the closure absorbed the new entries rather than
    // dropping them into a dangling ref.
    const compiled = ajv().validator.compile(loaded.loweredSchema);
    const conformant = compiled.validate({ s: { p: { a: 1, b: { x: 1, y: "s" } } } });
    expect(
      conformant.ok,
      `the declared argument must validate through the whole $ref chain; observed ${JSON.stringify(conformant)}`,
    ).toBe(true);
    const nonObject = compiled.validate({ s: { p: 7 } });
    expect(
      nonObject.ok,
      `\`properties.p = {}\` accepts any JSON value for a param declared as an object — the accept-anything hole element 3 names; observed ${JSON.stringify(nonObject)}`,
    ).toBe(false);
    const missingNested = compiled.validate({ s: { p: { a: 1, b: { x: 1 } } } });
    expect(
      missingNested.ok,
      `the nested fragment's own \`required\` is enforced; observed ${JSON.stringify(missingNested)}`,
    ).toBe(false);
  });

  it("RED (e2, fixture C2): a FLAT inline object field lowers its own $ref, so C1 and C2 stop being byte-identical", () => {
    // Element 3 is not a nesting defect: every inline object type written as a
    // field type lowers `{}` today, so the nested and the flat declaration
    // produce the same bytes and neither constrains anything.
    const nested = loadCleanly(
      "C1",
      paramsSrc(
        "  s: S",
        `${TRIAGE_BODY}schema S { p: {a: integer, b: {x: integer, y: string}} }\nlet x = 1\n`,
      ),
    );
    const flat = loadCleanly(
      "C2",
      paramsSrc("  s: S", `${TRIAGE_BODY}schema S { p: {a: integer, b: string} }\nlet x = 1\n`),
    );
    const S = flat.defs["S"] as Record<string, unknown>;
    expect(
      (S["properties"] ?? {}) as Record<string, unknown>,
      `bug 0039 §Expected: \`schema S { p: {a: integer, b: string} }\` lowers \`$defs.S.properties.p\` to a $ref, not \`{}\`; observed ${JSON.stringify(S["properties"])}`,
    ).toEqual({ p: { $ref: `#/$defs/${FLAT_INLINE}` } });
    expect(
      flat.defs[FLAT_INLINE],
      `the hoisted fragment carries both declared fields; observed ${JSON.stringify(flat.defs[FLAT_INLINE])}`,
    ).toEqual(FLAT_FRAGMENT);
    expectRefsClosed("C2", flat.loweredSchema);
    expect(
      JSON.stringify(flat.loweredSchema) === JSON.stringify(nested.loweredSchema),
      `two DIFFERENT declarations must not lower to the same bytes; C1=${JSON.stringify(nested.loweredSchema)} C2=${JSON.stringify(flat.loweredSchema)}`,
    ).toBe(false);
  });

  it("RED (e3, fixture C5): a single-brace-group alias RHS lowers a $ref whose def is PRESENT and AJV-compilable", () => {
    // `schema X = {a: integer, b: string}` runs through `lowerTypeSource` from
    // `buildBodyTypeSchemas`'s alias arm, so it is the same missing arm as e1/e2
    // reached by a different route. The compile is the load-bearing half: pass 3
    // rebuilds the closure from `bodies`, and an `__inline_<slug>` name has no
    // `bodies` entry, so a mint without a closure fix leaves a dangling `$ref`
    // AJV refuses with `MissingRefError`.
    const loaded = loadCleanly(
      "C5",
      paramsSrc("  s: X", `${TRIAGE_BODY}schema X = {a: integer, b: string}\nlet x = 1\n`),
    );
    expect(
      loaded.defs["X"],
      `schema-subset.md:73/:76 at the alias RHS (bug 0033's fifth position); observed ${JSON.stringify(loaded.defs["X"])}`,
    ).toEqual({ $ref: `#/$defs/${FLAT_INLINE}` });
    expect(
      loaded.defs[FLAT_INLINE],
      `the minted fragment must be present at the DOCUMENT root, or the alias's $ref dangles; observed ${JSON.stringify(loaded.defs[FLAT_INLINE])}`,
    ).toEqual(FLAT_FRAGMENT);
    expectRefsClosed("C5", loaded.loweredSchema);

    const compiled = ajv().validator.compile(loaded.loweredSchema);
    const good = compiled.validate({ s: { a: 1, b: "s" } });
    expect(good.ok, `the declared argument validates; observed ${JSON.stringify(good)}`).toBe(true);
    const bad = compiled.validate({ s: 7 });
    expect(
      bad.ok,
      `\`$defs.X = {}\` accepts anything today; observed ${JSON.stringify(bad)}`,
    ).toBe(false);
  });

  it("CONTROL (e4, fixture C3): every byte of the `params:` position's lowering is unchanged", () => {
    // Bug 0039 §Fix: "The `params:` position's bytes do not move", including the
    // two minted slugs, if the shared arm is factored out of
    // `lowerParamsFieldType`. This is also the shape the annotation root (a1)
    // and the body field (e1) are measured against.
    const loaded = loadCleanly(
      "C3",
      paramsSrc(`  p: "{a: integer, b: {x: integer, y: string}}"`, `${TRIAGE_BODY}let x = 1\n`),
    );
    expect(
      loaded.loweredSchema,
      `bug 0035's fix (0.44.0) already implements both parts at this position; observed ${JSON.stringify(loaded.loweredSchema)}`,
    ).toEqual({
      type: "object",
      properties: { p: { $ref: `#/$defs/${A1_INLINE}` } },
      required: ["p"],
      additionalProperties: false,
      $defs: { [XY_INLINE]: XY_FRAGMENT, [A1_INLINE]: A1_BODY },
    });
  });

  it("RED (e5, fixture C6): a union of brace arms on the alias RHS hoists EACH arm, and the document closes", () => {
    // §Fix's "Existing pins that move by design": a well-formed brace-rooted
    // union arm is a `Type` position, so part B makes it hoist. HEAD lowers
    // `{"anyOf":[{},{}]}` here — two arms that assert nothing, so `s: 7` is
    // accepted for a param declared as one of two object shapes.
    //
    // The WHOLE source stays out of the field-list reading: its index-0 `{`
    // closes at `{a: integer}`, so it is not a single enclosing brace group and
    // the union splits first. Each ARM is one, and hoists on its own.
    const loaded = loadCleanly(
      "C6",
      paramsSrc("  s: X", `${TRIAGE_BODY}schema X = {a: integer} | {b: integer}\nlet x = 1\n`),
    );
    expect(
      loaded.defs["X"],
      `schema-subset.md:73/:76 per ARM, in SOURCE order; observed ${JSON.stringify(loaded.defs["X"])}`,
    ).toEqual({
      anyOf: [{ $ref: `#/$defs/${A_INT_INLINE}` }, { $ref: `#/$defs/${B_INT_INLINE}` }],
    });
    expect(
      [loaded.defs[A_INT_INLINE], loaded.defs[B_INT_INLINE]],
      `both arms' fragments must reach the DOCUMENT root, or the alias's own $refs dangle; $defs keys=${JSON.stringify(Object.keys(loaded.defs))}`,
    ).toEqual([A_INT_FRAGMENT, B_INT_FRAGMENT]);
    expectRefsClosed("C6", loaded.loweredSchema);

    const compiled = ajv().validator.compile(loaded.loweredSchema);
    for (const [label, argument, ok] of [
      ["the first arm's shape", { a: 1 }, true],
      ["the second arm's shape", { b: 2 }, true],
      ["neither arm's shape", { c: 3 }, false],
      ["a non-object argument", 7, false],
    ] as const) {
      const result = compiled.validate({ s: argument });
      expect(
        result.ok,
        `${label}: a two-arm union of object types admits exactly its arms; observed ${JSON.stringify(result)}`,
      ).toBe(ok);
    }
  });
});

// ===========================================================================
// (f) MECHANISM B IN ISOLATION — the two lowerers called directly, with
// `Triage` present in the resolution map. These bound the fix to the shared
// lowering rather than to any one caller.
// RED at HEAD: E1/E2 return `{}` with an empty sink; E3 returns the phantom
// fragment.
// ===========================================================================

describe("bug 0039 (f) — the shared lowerers themselves", () => {
  /** The resolution map every fixture here resolves `Triage` against. */
  function triageMap(): ReadonlyMap<string, Record<string, unknown>> {
    return new Map<string, Record<string, unknown>>([["Triage", TRIAGE_DEF]]);
  }

  it("RED (f1, fixture E1): `lowerTypeSource` hoists a brace-rooted source and pushes the name it cannot resolve", () => {
    const defs: Record<string, Record<string, unknown>> = {};
    const unresolved: string[] = [];
    const lowered = lowerTypeSource("{x: Tirage, y: string}", triageMap(), defs, unresolved);
    expect(
      lowered,
      `bug 0039 §Fix part B — \`lowerTypeSource\` gains the hoisting inline-object arm \`lowerParamsFieldType\` implements; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ $ref: `#/$defs/${E1_INLINE}` });
    expect(
      defs[E1_INLINE],
      `the minted fragment: \`x\` stays permissive because \`Tirage\` resolves to nothing (the documented unresolved-arm disposition), and \`y\` lowers; observed ${JSON.stringify(defs)}`,
    ).toEqual(E1_FRAGMENT);
    expect(
      unresolved,
      `the sink is what every one of the walker's three production call sites reads; observed ${JSON.stringify(unresolved)}`,
    ).toEqual(["Tirage"]);
  });

  it("RED (f2, fixture E2): a nested object naming a DECLARED schema registers the `$ref` and its target", () => {
    // The sharpest statement of mechanism B: one field, no comma, a name that
    // resolves — and today the whole source lowers `{}` with an empty `defs`.
    const defs: Record<string, Record<string, unknown>> = {};
    const unresolved: string[] = [];
    const lowered = lowerTypeSource("{x: Triage}", triageMap(), defs, unresolved);
    expect(
      lowered,
      `schema-subset.md:73/:76 — the hoist applies in ANY type position, and \`lowerTypeExpr\`'s trailing catch-all (params.ts:409–411) is what swallows this source today; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ $ref: `#/$defs/${E2_INLINE}` });
    expect(
      defs,
      `both the hoisted fragment and the named schema it references must be registered, or the $ref chain cannot be resolved by the caller's document assembly; observed ${JSON.stringify(defs)}`,
    ).toEqual({ [E2_INLINE]: E2_FRAGMENT, Triage: TRIAGE_DEF });
    expect(unresolved, `\`Triage\` resolves; observed ${JSON.stringify(unresolved)}`).toEqual([]);
  });

  it("RED (f3, fixture E3): `lowerInlineObject`'s interior split treats a nested object as ONE field's type", () => {
    // Bug 0039 §Fix part A: `splitTopLevel(body, ",", "angle-and-brace")`.
    // Today the interior reads as three entries and the returned fragment is
    // the one the annotation root publishes as its response schema.
    const unresolved: string[] = [];
    const lowered = lowerInlineObject(
      "a: integer, b: {x: Tirage, y: string}",
      triageMap(),
      unresolved,
    );
    expect(
      lowered,
      `two fields at this level, \`b\` a $ref to the hoisted nested fragment, and \`lowerObjectFields\`'s own \`$defs\` carrying it; observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { a: { type: "integer" }, b: { $ref: `#/$defs/${E1_INLINE}` } },
      required: ["a", "b"],
      additionalProperties: false,
      $defs: { [E1_INLINE]: E1_FRAGMENT },
    });
    expect(
      unresolved,
      `the name one brace deeper reaches the sink; observed ${JSON.stringify(unresolved)}`,
    ).toEqual(["Tirage"]);
  });
});

// ===========================================================================
// (g) THE RETENTION MACHINERY a mint reaches when its slug is ALREADY KNOWN,
// and the load-time channel a byte mismatch reports through.
//
// WHY THIS GROUP EXISTS AT THE UNIT LEVEL. Minting `__inline_` entries at the
// `schema`-body and alias-RHS positions puts schema-subset.md §Schema-slug
// collision posture on a lowering whose retention scope and `$defs` scope
// DIFFER: `buildBodyTypeSchemas` shares one retention table across a whole
// document while giving each schema decl a `defs` record of its own, where
// `parseParams` has one scope for both. So "already minted" is decided by two
// disjuncts here, and the winning fragment has to be re-registered into the
// scope about to emit a `$ref` naming it, or the enclosing `$defs` closure
// dangles and AJV refuses the document with `MissingRefError`.
//
// A REAL 64-bit slug collision needs ~2^32 hash work, so the branch that
// answers one is driven at the exported `hoistInlineObjectType` seam with a
// hand-built `LowerCtx` pre-seeded exactly as a collision would leave it — the
// technique the `params:` lock's own group (g) uses
// (tests/params-inline-object-lowering.test.ts). Nothing here is skipped:
// every claim below is asserted, and the one claim no test can construct is
// stated as a BOUND in g4 rather than pretended at.
//
// The slug pins stay oracle-derived: `A_INT_SLUG` and every `__inline_` name
// come from the hand-written canonical forms above, hashed with `node:crypto`,
// and group (0) is what keeps those forms honest.
// ===========================================================================

const COLLISION_CODE = "theta/load/schema-slug-collision";

describe("bug 0039 (g) — the hoist's retention, its cross-scope re-registration, and its collision channel", () => {
  /** A fragment that is NOT `{a: integer}`'s — the stand-in colliding entry. */
  const FOREIGN_FRAGMENT = {
    type: "object",
    properties: { zzz: { type: "string" } },
    required: ["zzz"],
    additionalProperties: false,
  };

  /** The declared resolution map every fixture here resolves names against. */
  function triageMap(): ReadonlyMap<string, Record<string, unknown>> {
    return new Map<string, Record<string, unknown>>([["Triage", TRIAGE_DEF]]);
  }

  /** One hand-built lowering scope, with the three sinks readable afterwards. */
  interface Seam {
    readonly ctx: LowerCtx;
    readonly defs: Record<string, Record<string, unknown>>;
    readonly inlineCanonical: Map<string, string>;
    readonly inlineFragments: Map<string, Record<string, unknown>>;
    readonly slugCollisions: string[];
  }

  /**
   * A scope whose `defs` is EMPTY and whose retention optionally already holds
   * `{a: integer}`'s slug — the state `buildBodyTypeSchemas` hands the SECOND
   * decl to mint a shape the first one minted.
   */
  function seam(
    seeded: { readonly canonical: string; readonly fragment: Record<string, unknown> } | undefined,
  ): Seam {
    const defs: Record<string, Record<string, unknown>> = {};
    const inlineCanonical = new Map<string, string>();
    const inlineFragments = new Map<string, Record<string, unknown>>();
    const slugCollisions: string[] = [];
    if (seeded !== undefined) {
      inlineCanonical.set(A_INT_SLUG, seeded.canonical);
      inlineFragments.set(A_INT_SLUG, seeded.fragment);
    }
    return {
      ctx: {
        bodyTypeMap: triageMap(),
        defs,
        unresolved: [],
        inlineCanonical,
        inlineFragments,
        slugCollisions,
      },
      defs,
      inlineCanonical,
      inlineFragments,
      slugCollisions,
    };
  }

  /** The per-field recursion `lowerTypeSource` hands the hoist, sinks threaded. */
  function fieldLowerer(
    s: Seam,
  ): (fieldSource: string, fieldCtx: LowerCtx) => Record<string, unknown> {
    return (fieldSource, fieldCtx) =>
      lowerTypeSource(fieldSource, fieldCtx.bodyTypeMap, fieldCtx.defs, fieldCtx.unresolved, {
        inlineCanonical: s.inlineCanonical,
        inlineFragments: s.inlineFragments,
        slugCollisions: s.slugCollisions,
      });
  }

  it("g1: the RETENTION disjunct decides alone — this scope's `defs` misses, and no second mint happens", () => {
    // The reading `parseParams` needs is `defs` alone, because its retention and
    // its `defs` are one scope. Keeping that reading here would let the second
    // decl of a document re-mint: `defs` misses, so the byte comparison never
    // runs and the retention is overwritten LAST-WINS — the silent aliasing
    // §Schema-slug collision posture forbids.
    const retained = { ...A_INT_FRAGMENT };
    const s = seam({ canonical: A_INT_CANONICAL, fragment: retained });
    expect(
      Object.keys(s.defs),
      "the `defs` disjunct cannot be what decides: this scope holds nothing before the call",
    ).toEqual([]);

    const emitted = hoistInlineObjectType("{a: integer}", s.ctx, fieldLowerer(s));

    expect(
      emitted,
      `schema-subset.md:76 — the emission names the slug-keyed entry either way; observed ${JSON.stringify(emitted)}`,
    ).toEqual({ $ref: `#/$defs/${A_INT_INLINE}` });
    expect(
      s.inlineFragments.get(A_INT_SLUG),
      `first-wins: the retained fragment is the SAME OBJECT after the call, so no re-mint displaced it; observed ${JSON.stringify(s.inlineFragments.get(A_INT_SLUG))}`,
    ).toBe(retained);
    expect(
      s.inlineCanonical.get(A_INT_SLUG),
      "the retained bytes are the canonical form, unchanged by a matching mint",
    ).toBe(A_INT_CANONICAL);
    expect(
      s.slugCollisions,
      `byte-equal canonical forms are the DEDUP case (schema-subset.md:73), not a collision; a report here would refuse legal theta; observed ${JSON.stringify(s.slugCollisions)}`,
    ).toEqual([]);
  });

  it("g2: the RETAINED fragment is re-registered into this scope's `defs` — by object identity, so the `$ref` closes", () => {
    // Without this write the scope emits a `$ref` to a name its own `$defs`
    // never carries, and `buildBodyTypeSchemas`'s pass 3 has nothing to put in
    // the decl's closure: AJV refuses the document with `MissingRefError`.
    const retained = { ...A_INT_FRAGMENT };
    const s = seam({ canonical: A_INT_CANONICAL, fragment: retained });

    const emitted = hoistInlineObjectType("{a: integer}", s.ctx, fieldLowerer(s));

    expect(
      Object.keys(s.defs),
      `the emitted \`$ref\` must have a target in THIS scope; observed ${JSON.stringify(s.defs)}`,
    ).toEqual([A_INT_INLINE]);
    expect(
      s.defs[A_INT_INLINE],
      "the RETAINED object itself, not a byte-equal copy of the fragment built during this call — first-wins is what keeps every `$ref` to one slug pointing at one fragment",
    ).toBe(retained);
    expect(
      s.defs[A_INT_INLINE],
      `and its bytes are the retained fragment's; observed ${JSON.stringify(s.defs[A_INT_INLINE])}`,
    ).toEqual(A_INT_FRAGMENT);
    expect(emitted, "the emission names that entry").toEqual({ $ref: `#/$defs/${A_INT_INLINE}` });
  });

  it("g3: a slug hit whose RETAINED BYTES DIFFER records the slug and keeps first-wins ACROSS the scope boundary", () => {
    // The seeded state is what a genuine 64-bit collision leaves behind: the
    // retention already answers for this slug, and the bytes beside it are not
    // the ones the fragment being minted now serialises to.
    const foreign = { ...FOREIGN_FRAGMENT };
    const s = seam({ canonical: '{"different":"bytes"}', fragment: foreign });

    const emitted = hoistInlineObjectType("{a: integer}", s.ctx, fieldLowerer(s));

    expect(
      s.slugCollisions,
      `the bare 16-hex slug reaches the sink \`buildBodyTypeSchemas\` attributes and \`collectBodyTypes\` turns into the registered ${COLLISION_CODE} (code-registry-load.md:58); observed ${JSON.stringify(s.slugCollisions)}`,
    ).toEqual([A_INT_SLUG]);
    expect(
      s.defs[A_INT_INLINE],
      `first wins across scopes too: the fragment written into THIS scope is the retained one, so an earlier decl's pointer and this one's name the same shape; observed ${JSON.stringify(s.defs[A_INT_INLINE])}`,
    ).toBe(foreign);
    expect(
      s.inlineFragments.get(A_INT_SLUG),
      "the retention itself is untouched by the refused mint",
    ).toBe(foreign);
    expect(emitted, "the refusal is carried by the diagnostic, not by a mangled pointer").toEqual({
      $ref: `#/$defs/${A_INT_INLINE}`,
    });
  });

  it("g4: `buildBodyTypeSchemas` carries a `collisions` sink per decl, and a shape two decls share is the SILENT dedup case", () => {
    // THE BOUND: the per-decl append-and-slice attribution can only fire on a
    // byte mismatch, and no input constructs one — the slug is a pure function
    // of the canonical bytes, so equal slugs mean equal bytes short of ~2^32
    // hash work. g3 pins the sink that attribution reads and g5 pins the
    // message it renders. What IS constructible here is the other half of the
    // posture, and it is not vacuous: the second decl enters the already-minted
    // branch for the first time, so a byte comparison answering wrong would
    // refuse a legal theta outright.
    const collisions: SchemaSlugCollision[] = [];
    const built = buildBodyTypeSchemas(
      [
        { name: "S", fields: [{ name: "p", typeSource: "{a: integer}" }] },
        { name: "T", fields: [{ name: "q", typeSource: "{a: integer}" }] },
      ],
      [],
      collisions,
    );

    expect(
      collisions,
      `two decls writing the identical inline shape dedup to one entry (schema-subset.md:73); observed ${JSON.stringify(collisions)}`,
    ).toEqual([]);

    const closureOf = (name: string): Record<string, unknown> => {
      const body = built.get(name);
      if (body === undefined) {
        throw new Error(
          `g4: \`${name}\` is absent from the built map: ${JSON.stringify([...built.keys()])}`,
        );
      }
      const defs = body["$defs"];
      if (defs === null || typeof defs !== "object") {
        throw new Error(
          `g4: \`${name}\` carries no \`$defs\` closure, so its hoisted pointer dangles: ${JSON.stringify(body)}`,
        );
      }
      return defs as Record<string, unknown>;
    };

    const sClosure = closureOf("S");
    const tClosure = closureOf("T");
    expect(
      [Object.keys(sClosure), Object.keys(tClosure)],
      `pass 3 must serve the hoisted name to BOTH decls, or one of them emits a pointer its closure cannot resolve; observed S=${JSON.stringify(sClosure)} T=${JSON.stringify(tClosure)}`,
    ).toEqual([[A_INT_INLINE], [A_INT_INLINE]]);
    expect(
      sClosure[A_INT_INLINE],
      "ONE retained fragment, served to both closures as the same object",
    ).toBe(tClosure[A_INT_INLINE]);
    expect(
      sClosure[A_INT_INLINE],
      `and its bytes are the minted fragment's; observed ${JSON.stringify(sClosure[A_INT_INLINE])}`,
    ).toEqual(A_INT_FRAGMENT);
    expect(
      built.has(A_INT_INLINE),
      `a synthesised name must NOT become resolvable as an author-written \`NamedType\`; observed keys ${JSON.stringify([...built.keys()])}`,
    ).toBe(false);
  });

  it("g5: the `collectBodyTypes` emission renders the registry's Message template for the collision code (DIAG-4)", () => {
    // DIAG-4 holds the two literals identical BY THE REGISTRY, not by shared
    // code, so the hold is asserted against the registry row rather than
    // against `parseParams`'s spelling of the same sentence.
    const template = registryMessage(REGISTRY, COLLISION_CODE) as string | undefined;
    expect(
      template,
      `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry the Message row for ${COLLISION_CODE}`,
    ).toBeDefined();
    const rendered = "`" + (template as string).replace("<slug>", "${collision.slug}") + "`";
    const source = readFileSync(
      fileURLToPath(new URL("../src/parser/theta-document.ts", import.meta.url)),
      "utf8",
    );
    expect(
      source.includes(rendered),
      `the emission site must spell the row's Message column verbatim with the slug interpolated; expected the literal ${rendered} in src/parser/theta-document.ts`,
    ).toBe(true);
  });

  it("g6: two schema decls sharing one inline shape mint ONE `$defs` entry that both closures serve, and the document compiles", () => {
    const loaded = loadCleanly(
      "g6",
      paramsSrc(
        "  s: S\n  t: T",
        `${TRIAGE_BODY}schema S { p: {a: integer} }\nschema T { q: {a: integer} }\nlet x = 1\n`,
      ),
    );
    expect(
      Object.keys(loaded.defs).sort(),
      `one hoisted entry for the shape both decls wrote, beside the two named bodies; observed ${JSON.stringify(Object.keys(loaded.defs))}`,
    ).toEqual([A_INT_INLINE, "S", "T"].sort());
    expect(
      [
        ((loaded.defs["S"] ?? {}) as Record<string, unknown>)["properties"],
        ((loaded.defs["T"] ?? {}) as Record<string, unknown>)["properties"],
      ],
      `each decl's own field emits the shared pointer; observed S=${JSON.stringify(loaded.defs["S"])} T=${JSON.stringify(loaded.defs["T"])}`,
    ).toEqual([
      { p: { $ref: `#/$defs/${A_INT_INLINE}` } },
      { q: { $ref: `#/$defs/${A_INT_INLINE}` } },
    ]);
    expect(
      loaded.defs[A_INT_INLINE],
      `the one retained fragment; observed ${JSON.stringify(loaded.defs[A_INT_INLINE])}`,
    ).toEqual(A_INT_FRAGMENT);
    expectRefsClosed("g6", loaded.loweredSchema);

    const compiled = ajv().validator.compile(loaded.loweredSchema);
    const good = compiled.validate({ s: { p: { a: 1 } }, t: { q: { a: 2 } } });
    expect(
      good.ok,
      `both arguments validate through the shared entry; observed ${JSON.stringify(good)}`,
    ).toBe(true);
    const bad = compiled.validate({ s: { p: { a: "x" } }, t: { q: { a: 2 } } });
    expect(
      bad.ok,
      `and the shared entry constrains both — \`a\` is an integer; observed ${JSON.stringify(bad)}`,
    ).toBe(false);
  });

  it("g7: an alias RHS mixing a BRACE arm with a NAMED arm hoists the brace arm, keeps the named reference, and compiles", () => {
    // §Fix's "Existing pins that move by design", end to end: the arm count and
    // the arm order are the source's (tests/schema-alias-union-decl.test.ts
    // group (j) pins both), and the brace arm's bytes are now a pointer.
    const loaded = loadCleanly(
      "g7",
      paramsSrc("  s: X", `${TRIAGE_BODY}schema X = { a: string } | Triage\nlet x = 1\n`),
    );
    expect(
      loaded.defs["X"],
      `arms in SOURCE order, the brace arm hoisted and the named arm resolved; observed ${JSON.stringify(loaded.defs["X"])}`,
    ).toEqual({
      anyOf: [{ $ref: `#/$defs/${A_STR_INLINE}` }, { $ref: "#/$defs/Triage" }],
    });
    expect(
      [loaded.defs[A_STR_INLINE], loaded.defs["Triage"]],
      `both arms' targets must reach the document root; $defs keys=${JSON.stringify(Object.keys(loaded.defs))}`,
    ).toEqual([A_STR_FRAGMENT, TRIAGE_DEF]);
    expectRefsClosed("g7", loaded.loweredSchema);

    const compiled = ajv().validator.compile(loaded.loweredSchema);
    for (const [label, argument, ok] of [
      ["the inline arm's shape", { a: "s" }, true],
      ["the named arm's shape", { urgent: true }, true],
      ["the inline arm's field at the wrong type", { a: 1 }, false],
      ["neither arm's shape", {}, false],
    ] as const) {
      const result = compiled.validate({ s: argument });
      expect(
        result.ok,
        `${label}: the union admits exactly its two arms; observed ${JSON.stringify(result)}`,
      ).toBe(ok);
    }
  });

  it("CONTROL (g8): the permissive-`{}` family keeps its members when a brace arm makes the union lower arm by arm", () => {
    // §Fix's closing paragraph: the literal arm of a mixed union, an unresolved
    // name, and the non-`array` generic keep their `{}`. Each now sits beside a
    // hoisted arm, and each is still lowered by the same `lowerTypeExpr` call
    // the whole-source delegation made on it.
    const rows: ReadonlyArray<
      readonly [string, string, Record<string, unknown>, readonly string[]]
    > = [
      [
        "a LITERAL arm",
        '{ a: string } | "lit"',
        { anyOf: [{ $ref: `#/$defs/${A_STR_INLINE}` }, {}] },
        [],
      ],
      [
        "an UNRESOLVED name arm",
        "{ a: string } | Tirage",
        { anyOf: [{ $ref: `#/$defs/${A_STR_INLINE}` }, {}] },
        ["Tirage"],
      ],
      [
        "a non-`array` GENERIC arm",
        "{ a: string } | Result<Triage, Triage>",
        { anyOf: [{ $ref: `#/$defs/${A_STR_INLINE}` }, {}] },
        [],
      ],
    ];
    for (const [label, source, expected, names] of rows) {
      const defs: Record<string, Record<string, unknown>> = {};
      const unresolved: string[] = [];
      const lowered = lowerTypeSource(source, triageMap(), defs, unresolved);
      expect(
        lowered,
        `${label}: bug 0039 §Fix leaves this member of the permissive-\`{}\` family untouched; observed ${JSON.stringify(lowered)}`,
      ).toEqual(expected);
      expect(
        unresolved,
        `${label}: the arm's names still resolve through the same \`lowerTypeExpr\` call; observed ${JSON.stringify(unresolved)}`,
      ).toEqual(names);
    }

    // A union with NO brace arm is handed whole to `lowerTypeExpr` exactly as
    // before, which is what keeps the shapes bug 0039 never assessed frozen.
    // `lowerTypeExpr` itself now splits that union before testing for a
    // generic application (bug 0043 §Fix), so the third row below moved: it
    // is what the retired pre-emption used to swallow. The first two rows
    // never reached that pre-emption at all — neither source ends in `>` —
    // so they stay exactly as they were.
    const braceFree: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["Triage | integer", { anyOf: [{ $ref: "#/$defs/Triage" }, { type: "integer" }] }],
      ["string | null", { type: ["string", "null"] }],
      // post-fix bytes: bug 0043 §Fix reorders `lowerTypeExpr` to split a
      // union before testing for a generic application, so this brace-free
      // union — whose last arm is `array<integer>` — now splits and lowers
      // per SUBS-1 instead of collapsing to `{}`. Pinned in anticipation by
      // bug 0039's own fix report, `.pi/tmp/fixes/0039-report.md` residual 5:
      // "Brace-free unions (`Triage | array<integer>`) stay `{}` and are
      // pinned. 0043's family statement should be narrowed to the
      // brace-free subset."
      [
        "Triage | array<integer>",
        { anyOf: [{ $ref: "#/$defs/Triage" }, { type: "array", items: { type: "integer" } }] },
      ],
    ];
    for (const [source, expected] of braceFree) {
      const lowered = lowerTypeSource(source, triageMap(), {}, []);
      expect(
        lowered,
        `\`${source}\` carries no brace arm, so its bytes must not move; observed ${JSON.stringify(lowered)}`,
      ).toEqual(expected);
    }
  });
});

// ===========================================================================
// (h) THE SHREDDED-SEGMENT GUARD — `arms.every(isBraceBalanced)`, the
// module-private predicate (src/parser/params.ts) that guards
// `lowerBraceGroupUnionArms`, the arm dispatch `lowerTypeSource` relies on to
// decide whether the `|` segments of a source are ARMS at all.
//
// WHAT THE SPLIT DOES TO A BRACE GROUP CARRYING AN INTERIOR `|`.
// `lowerTypeSource` splits with `splitTopLevel(s, "|")` in the angle-only
// default: `<…>` and quoted regions are depth, `{…}` is not. So a `|` written
// INSIDE a brace group reads as an arm separator and cuts the group into
// pieces. `Cat | {a: integer | {c: Ghost} | boolean}` presents as the FOUR
// segments `Cat`, `{a: integer`, `{c: Ghost}` and `boolean}` — two of them
// visibly not types, one opening a brace it never closes and one closing a
// brace it never opened.
//
// WHY THE BALANCED-LOOKING SHARD IS STILL NOT A `Type`. `{c: Ghost}` is
// brace-balanced AND is a single enclosing brace group, and it is nonetheless
// not an arm of this union: it is the type of a NESTED union arm, inside the
// field `a` of the group the split destroyed. Hoisting it would mint a `$defs`
// entry and emit a `$ref` for a shape the author never wrote at THIS level —
// the silently wrong lowering bug 0039 §Fix constraint 1 forbids — and would
// descend a name the enclosing group's own lowering never reaches, so `Ghost`
// would raise `theta/parse/unresolved-named-type` and REFUSE a theta that
// loads clean today. The trigger is positionally invisible: where the cuts
// fall is a function of where the author put the next `|`, not of the type.
// Appending ` | boolean` after the nested group is what leaves `{c: Ghost}`
// standing alone as a segment; without it the same nested group merges into a
// neighbouring shard and nothing looks hoistable.
//
// THE BRACKET. h4 is the neighbour whose segment set the split left INTACT:
// `{ a: Ghost } | Cat` is two balanced segments, so its arms ARE arms, the
// brace one hoists, and the name inside it raises. h1–h3 and h4 together state
// the guard's actual content — not "never hoist a brace segment", but "hoist
// only where the split did not shred". Reading `arms.every(…)` as `true` is
// the mutation this group exists to catch: h1, h2 and h3 red under it, h4
// stays green, and the pair is what tells the two apart.
// ===========================================================================

describe("bug 0039 (h) — a SHREDDED `|` segment set declines the arm dispatch, balanced shard included", () => {
  /** The declared name every fixture here resolves; `Ghost` is declared nowhere. */
  const CAT_BODY = "schema Cat { paws: integer }\n";

  /** The closed lowering of that declaration — the `#/$defs/Cat` target. */
  const CAT_DEF = {
    type: "object",
    properties: { paws: { type: "integer" } },
    required: ["paws"],
    additionalProperties: false,
  };

  /** The resolution map the direct-seam rows resolve `Cat` against. */
  function catMap(): ReadonlyMap<string, Record<string, unknown>> {
    return new Map<string, Record<string, unknown>>([["Cat", CAT_DEF]]);
  }

  /** The shred: a named arm, then a brace group whose interior carries two `|`. */
  const SHREDDED = "Cat | {a: integer | {c: Ghost} | boolean}";

  /** The same shape mirrored — the brace group first, the named arm last. */
  const SHREDDED_MIRRORED = "{ a: Cat | {c: Ghost} | boolean } | Cat";

  it("CONTROL (h1): the shredded alias RHS loads CLEAN and its lowered bytes stay per-segment", () => {
    // `Ghost` is declared nowhere, so a single descent into the shard
    // `{c: Ghost}` is a refused theta. `loadCleanly` asserts the empty
    // diagnostic list first, which is the load-path direction of the guard.
    const loaded = loadCleanly(
      "h1",
      paramsSrc("  s: X", `${CAT_BODY}schema X = ${SHREDDED}\nlet x = 1\n`),
    );
    expect(
      loaded.defs["X"],
      `a shredded set is handed WHOLE to \`lowerTypeExpr\`, which lowers each piece permissively — the per-\`|\`-segment \`anyOf\` bug 0033 §Fix residual (ii) records, with the one genuine segment \`Cat\` resolved; observed ${JSON.stringify(loaded.defs["X"])}`,
    ).toEqual({ anyOf: [{ $ref: "#/$defs/Cat" }, {}, {}, {}] });
    expect(
      Object.keys(loaded.defs).sort(),
      `no \`__inline_\` entry may be minted from a shard: the only \`$defs\` names are the two declarations; observed ${JSON.stringify(Object.keys(loaded.defs))}`,
    ).toEqual(["Cat", "X"]);
    expectRefsClosed("h1", loaded.loweredSchema);
  });

  it("CONTROL (h2): the same text resolves no name at the walker seam and mints nothing at the lowerer seam", () => {
    // The diagnostic direction, stated where the three production call sites
    // read it: the walker returns NAMES, and a descent into the shard would put
    // `Ghost` in this list and refuse the theta h1 loads.
    const names = collectUnresolvedNamedTypes(SHREDDED, new Set(["Cat"]));
    expect(
      names,
      `\`Ghost\` is written inside a shard, never at a position this source declares a type in; observed ${JSON.stringify(names)}`,
    ).toEqual([]);

    const defs: Record<string, Record<string, unknown>> = {};
    const unresolved: string[] = [];
    const lowered = lowerTypeSource(SHREDDED, catMap(), defs, unresolved);
    expect(
      lowered,
      `the shared lowerer's own bytes for the shredded set; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ anyOf: [{ $ref: "#/$defs/Cat" }, {}, {}, {}] });
    expect(
      Object.keys(defs),
      `only the named segment registers a target — a hoisted shard would add an \`__inline_\` key here; observed ${JSON.stringify(defs)}`,
    ).toEqual(["Cat"]);
    expect(
      unresolved,
      `the sink every production call site reads must stay empty; observed ${JSON.stringify(unresolved)}`,
    ).toEqual([]);
  });

  it("CONTROL (h3): the MIRRORED shred — brace group first, named arm last — behaves identically", () => {
    // Segment ORDER is not what the guard reads, so the mirror pins that the
    // decision is a property of the SET: `{ a: Cat`, `{c: Ghost}`, `boolean }`,
    // `Cat`, with the standalone shard now second rather than third.
    const loaded = loadCleanly(
      "h3",
      paramsSrc("  s: X", `${CAT_BODY}schema X = ${SHREDDED_MIRRORED}\nlet x = 1\n`),
    );
    expect(
      loaded.defs["X"],
      `per-segment again, the resolved arm now LAST because that is where the source puts it; observed ${JSON.stringify(loaded.defs["X"])}`,
    ).toEqual({ anyOf: [{}, {}, {}, { $ref: "#/$defs/Cat" }] });
    expect(
      Object.keys(loaded.defs).sort(),
      `no \`__inline_\` entry, in either orientation; observed ${JSON.stringify(Object.keys(loaded.defs))}`,
    ).toEqual(["Cat", "X"]);
    expectRefsClosed("h3", loaded.loweredSchema);

    const names = collectUnresolvedNamedTypes(SHREDDED_MIRRORED, new Set(["Cat"]));
    expect(
      names,
      `\`Ghost\` stays invisible when the shard sits second; observed ${JSON.stringify(names)}`,
    ).toEqual([]);
  });

  it("RED (h4): the BALANCED-set neighbour DOES hoist its brace arm and DOES raise the name inside it", () => {
    // The contrast that gives h1–h3 their meaning. `{ a: Ghost } | Cat` cuts
    // into two segments, both brace-balanced, so the split shredded nothing:
    // the arms ARE arms, the brace one is a `Type` position, and part B hoists
    // it. The descent h1–h3 must NOT make is exactly the descent this row
    // requires — the guard separates the two on segment balance alone.
    const doc = parseDoc(
      bodySrc(`${CAT_BODY}schema X = { a: Ghost } | Cat\nlet x = 1\n`),
      "bug0039.theta",
    );
    expect(
      diagLines(doc),
      `code-registry-parse.md:89 position 4: a name written inside a genuine brace ARM resolves against nothing and raises; observed ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([unresolvedLine("Ghost")]);

    const defs: Record<string, Record<string, unknown>> = {};
    const unresolved: string[] = [];
    const lowered = lowerTypeSource("{ a: Ghost } | Cat", catMap(), defs, unresolved);
    expect(
      lowered,
      `schema-subset.md:73/:76 per ARM: the brace arm hoists, the named arm resolves; observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      anyOf: [{ $ref: `#/$defs/${A_GHOST_INLINE}` }, { $ref: "#/$defs/Cat" }],
    });
    expect(
      defs[A_GHOST_INLINE],
      `the minted fragment, its \`a\` permissive because \`Ghost\` resolves to nothing; observed ${JSON.stringify(defs)}`,
    ).toEqual(A_GHOST_FRAGMENT);
    expect(
      unresolved,
      `and the name reaches the sink, which is what refuses the theta above; observed ${JSON.stringify(unresolved)}`,
    ).toEqual(["Ghost"]);
  });
});
