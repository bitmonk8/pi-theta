import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { collectUnresolvedNamedTypes } from "../src/parser/body-type-lowering";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { respondSchemaIsEnveloped, respondToolWireSchema } from "../src/runtime/respond-tool-wire";
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0053 — `lowerQueryResponseSchema`'s ROOT brace dispatch is a
// prefix/suffix test, so a top-level union of object arms is read as ONE inline
// field list, and the identical dispatch in `collectUnresolvedNamedTypes`
// swallows the name a union arm owes
// (docs/bugs/0053-annotation-root-brace-union-read-as-one-field-list.md).
//
// ONE PREDICATE, TWO COPIES, TWO ELEMENTS.
//
//   THE PREDICATE. `s.startsWith("{") && s.endsWith("}")`
//   (src/runtime/query-schema-lowering.ts:140) is positional, not structural:
//   it asks for a `{` at index 0 and a `}` at the last index, never that the
//   two are the same group. A top-level union whose first and last arms are
//   object types answers yes, because the first arm opens the source and the
//   last arm closes it. `s.slice(1, -1)` then hands
//   `a: integer} | {b: integer` to `lowerInlineObject` as a field list.
//   `src/parser/params.ts:997` already holds the structural predicate —
//   `isSingleEnclosingBraceGroup`, a depth walk that returns true only when
//   the index-0 `{` closes at the final index, re-exported by
//   `src/parser/body-type-lowering.ts:34` — and `lowerTypeSource` (`:339`) is
//   its only caller, which is why every position routing through that
//   function lowers the same text correctly.
//
//   1. THE ANNOTATION ROOT MINTS A WRONG FRAGMENT AND ENFORCES IT. The root is
//      the one position where an inline-object fragment is the document ROOT
//      rather than a field's type, so `topLevelColon`'s field `a` with type
//      source `integer} | {b: integer` becomes the response schema: `required`
//      demands `a`, `additionalProperties: false` refuses `b`, and the field's
//      own `anyOf: [{}, {}]` constrains `a` to nothing. QRY-22 validates the
//      reply against it and the respond tool registers with it verbatim.
//      Groups (b), (c), (d).
//   2. THE NAME WALK UNDER-EMITS ON THE SAME PREDICATE.
//      `collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts:601`,
//      dispatch at `:614`) collects names BY lowering, so a brace-rooted union
//      reproduces the mis-parse: the single field's type source is a shredded
//      segment set, `lowerTypeExpr` lowers each shard on its catch-all, and no
//      name is appended. Both production call sites inherit it —
//      `src/parser/theta-document.ts:6375` (the `@<T>` annotation) and `:5676`
//      (the alias RHS). Group (e).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:94 — `Type "|" Type`, recursive; `:101` —
//     `ObjectType` is a `Type`. `{a: integer} | {b: integer}` is a TWO-ARM
//     union of object types, not one object type.
//   - :105 and docs/spec_topics/type-system.md:15 — the `@<T>` ascription
//     position carries the same `Type` grammar as the alias RHS, so one type
//     expression lowers identically at both.
//   - docs/spec_topics/schema-subset.md:81 (SUBS-1) — a union with a
//     non-primitive arm lowers to `{"anyOf": [...]}`, arms in source order;
//     `:82` names the object-union case; `:73` (step 2) hoists each inline
//     object arm under `__inline_<slug>` and `:76` (step 3) emits
//     `{"$ref": "#/$defs/<Name>"}` at its use.
//   - :92–:108 §Canonical schema hash — the slug recipe the oracle below
//     implements by hand (code-point-sorted object keys, array elements in
//     lowering order, no insignificant whitespace, SHA-256, first 16 lowercase
//     hex characters).
//   - docs/spec_topics/query/query-failure-and-repair.md:78 (QRY-22) — the
//     runtime validates the reply against the DECLARED shape; `:42` —
//     `<schema-json>` is the respond tool's wire schema, so the fragment is
//     also what the model is shown.
//   - docs/spec_topics/query/query-tool-loop.md:20 — §Respond-tool wire schema:
//     a root the subset pins to a non-object form registers under the
//     single-property `value` envelope.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:90 — the
//     `theta/parse/unresolved-named-type` row, five positions, error severity.
//     The row already names the `@<T>` annotation and the alias RHS, so this
//     needs no registry edit; GOV-15's diagnostic-registry carve-out
//     (docs/spec_topics/governance/source-language-stability.md:25) covers the
//     newly-refused typo inputs.
//
// PROBED CURRENT SIGNATURES (HEAD bdb1cca5 / 0.57.0, offline, deterministic,
// byte-identical to the bug doc's §Reproduction tables at 0.49.0 — zero drift).
// `Triage` is declared in every load-path fixture; `Ghost` is declared nowhere.
//
//   P1  {a: integer} | {b: integer}
//         {"type":"object","properties":{"a":{"anyOf":[{},{}]}},
//          "required":["a"],"additionalProperties":false}
//   V1/V2/V3  the same source with leading space, trailing space, no spaces
//         :: identical to P1 — the predicate reads neither spacing…
//   V4  {a: integer} | {b: integer} | {c: integer}
//         properties {"a":{"anyOf":[{},{},{}]}}            …nor arm count
//   P7  {x: {p: integer, q: boolean}} | {y: string}
//         properties {"x":{"anyOf":[{},{}]}}  required ["x"]
//   AJV over P1   {"a":1} ok · {"b":1} REFUSED · {"a":null} ok ·
//                 {"a":"not an integer"} ok · {"a":{"deep":true}} ok ·
//                 {"a":1,"b":1} REFUSED · {"c":3} REFUSED
//   respondToolWireSchema(P1) :: P1 verbatim   respondSchemaSlug(P1) :: 81e7d0e308042785
//   W  {a: integer} | {b: Ghost}   :: []       W  integer | {b: Ghost}  :: ["Ghost"]
//   @<{a: integer} | {b: Ghost}>   diags []    schema X = {a: integer} | {b: Ghost}  diags []
//   P8  {a: integer, b: string}                two typed fields, object root
//   P8b {a: integer, b: {x: integer, y: string}}   `b` a $ref, nested fragment hoisted
//   G5  {}                                     properties {} required []
//   @<X> for `schema X = {a: integer} | {b: integer}`
//         :: the SUBS-1 anyOf over two hoisted $refs — already correct today
//   { a: string | null } | Cat                 {"anyOf":[{},{},{}]}
//   params p: "{a: integer} | {b: integer}"    bug 0097 §Fix: anyOf over BOTH
//         hoisted arms, byte-identical to the root's mint above
//
// WHAT IS RED HERE: groups (b), (c), (d) and (e) minus their CONTROL rows.
// Group (a) MINUS a6 is the byte-invariance control set, and group (0) is the
// oracle; both are GREEN at HEAD and must stay green byte-for-byte — they are
// what bounds bug 0053's fix to the union case at the ANNOTATION ROOT. a6 is
// the exception inside that group: it drives the `params:` position, whose
// bytes for the same union bug 0097 §Fix moves, so it is that report's PARITY
// row — the `params:` document's arm fragments byte-equal to the root's, under
// identical names — rather than an invariance control. Group (a) is asserted
// FIRST so a red below names the defect rather than a broken control.
//
// THE PARITY PIN IS THE DECISIVE CELL. `@<X>` for
// `schema X = {a: integer} | {b: integer}` ALREADY produces the SUBS-1 document
// today, because the named-annotation arm resolves before the brace test and
// the alias RHS lowers through `lowerTypeSource`. Group (c) asserts the two
// spellings of one type expression, in one document, are byte-equal — which is
// type-system.md:15 stated as an executable claim rather than as prose.
//
// THE SLUG ORACLE IS INDEPENDENT. `schemaSlug` (src/parser/schema-lowering.ts)
// is deliberately NOT imported: an oracle taken from the implementation under
// test proves nothing. Every expected `__inline_<slug>` below is derived from a
// HAND-WRITTEN canonical-form string following the §Canonical schema hash
// recipe, hashed with `node:crypto`. Group (0) keeps those strings honest three
// ways: parse-back equality against the fragment each claims to serialise, a
// whitespace and key-sort check, and a CROSS-CHECK against three slugs
// production mints TODAY — two at the annotation root, one at the `params:`
// position from a declaration whose fields are written in non-sorted order, so
// the key sort is exercised end to end rather than asserted against itself.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one function call — `parseThetaDocument` over a string, or a direct lowering
// call — plus one real AJV compile of the document that call produces. An
// integration or live tier can observe neither of the two things under
// assertion: a diagnostic's PRESENCE at load, and the exact `$defs` bytes of a
// lowering. A provider round-trip would add stochastic surface to a contract
// fully determined at the lowering boundary. `parseDoc`
// (tests/helpers/e2e-s1.ts) is the shipped load path wrapped in the standard
// inert `parseDeps` double, and is the harness the bug doc's own §Reproduction
// used.
//
// NO SILENT SKIPPING: every fixture that must load asserts its diagnostic list
// and then fails LOUDLY — diagnostics rendered — if the frontmatter, the params
// block or the lowered annotation is absent. A refused parse or an unlowerable
// annotation can never be mistaken for a pass.

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
 * The one rendered diagnostic line both emitting positions must produce for a
 * name written inside a union arm. The `error` prefix is the row's severity
 * column: an error-severity parse diagnostic is what refuses the theta.
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

/** `{a: integer}` — P1's FIRST arm. */
const A_INT_FRAGMENT = {
  type: "object",
  properties: { a: { type: "integer" } },
  required: ["a"],
  additionalProperties: false,
};
const A_INT_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"integer"}},"required":["a"],"type":"object"}';
const A_INT_INLINE = inlineDefName(A_INT_CANONICAL);

/** `{b: integer}` — P1's SECOND arm, distinct from the first. */
const B_INT_FRAGMENT = {
  type: "object",
  properties: { b: { type: "integer" } },
  required: ["b"],
  additionalProperties: false,
};
const B_INT_CANONICAL =
  '{"additionalProperties":false,"properties":{"b":{"type":"integer"}},"required":["b"],"type":"object"}';
const B_INT_INLINE = inlineDefName(B_INT_CANONICAL);

/** `{c: integer}` — V4's third arm, which pins that arm COUNT is not the axis. */
const C_INT_FRAGMENT = {
  type: "object",
  properties: { c: { type: "integer" } },
  required: ["c"],
  additionalProperties: false,
};
const C_INT_CANONICAL =
  '{"additionalProperties":false,"properties":{"c":{"type":"integer"}},"required":["c"],"type":"object"}';
const C_INT_INLINE = inlineDefName(C_INT_CANONICAL);

/** `{p: integer, q: boolean}` — P7's innermost fragment, one level down. */
const PQ_FRAGMENT = {
  type: "object",
  properties: { p: { type: "integer" }, q: { type: "boolean" } },
  required: ["p", "q"],
  additionalProperties: false,
};
const PQ_CANONICAL =
  '{"additionalProperties":false,"properties":{"p":{"type":"integer"},"q":{"type":"boolean"}},"required":["p","q"],"type":"object"}';
const PQ_INLINE = inlineDefName(PQ_CANONICAL);

/** `{x: {p: integer, q: boolean}}` — P7's FIRST arm, itself carrying a hoist. */
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

/** `{y: string}` — P7's SECOND arm. */
const Y_STR_FRAGMENT = {
  type: "object",
  properties: { y: { type: "string" } },
  required: ["y"],
  additionalProperties: false,
};
const Y_STR_CANONICAL =
  '{"additionalProperties":false,"properties":{"y":{"type":"string"}},"required":["y"],"type":"object"}';
const Y_STR_INLINE = inlineDefName(Y_STR_CANONICAL);

/**
 * `{b: Ghost}` — the arm group (e)'s union hoists once the root splits. `b` is
 * permissive because `Ghost` resolves to nothing, which is the documented
 * unresolved-arm disposition; what the fixture reads off the fragment is that
 * the arm was ENTERED at all, so the name one brace deeper reaches the walk.
 */
const B_GHOST_FRAGMENT = {
  type: "object",
  properties: { b: {} },
  required: ["b"],
  additionalProperties: false,
};
const B_GHOST_CANONICAL =
  '{"additionalProperties":false,"properties":{"b":{}},"required":["b"],"type":"object"}';
const B_GHOST_INLINE = inlineDefName(B_GHOST_CANONICAL);

/**
 * `{m: {a: integer} | {b: integer}}` — the oracle's ARRAY-NESTING fixture, and
 * the only canonical form here that nests objects inside an array. Its `anyOf`
 * carries two DISTINCT `$ref` elements, so §Canonical schema hash `:104`
 * ("array elements left in lowering order") is distinguishable from a recipe
 * that sorted them — `df817b794ef788ce` sorts AFTER `8cc8cb1e7074a3af`, and
 * lowering order puts it first. Production mints it at the `params:` position
 * for the P1 text one nesting down (bug 0097 §Fix), which is what the
 * cross-check below reads.
 */
const M_UNION_FRAGMENT = {
  type: "object",
  properties: {
    m: { anyOf: [{ $ref: `#/$defs/${A_INT_INLINE}` }, { $ref: `#/$defs/${B_INT_INLINE}` }] },
  },
  required: ["m"],
  additionalProperties: false,
};
const M_UNION_CANONICAL =
  `{"additionalProperties":false,"properties":{"m":{"anyOf":[{"$ref":"#/$defs/${A_INT_INLINE}"},` +
  `{"$ref":"#/$defs/${B_INT_INLINE}"}]}},"required":["m"],"type":"object"}`;
const M_UNION_INLINE = inlineDefName(M_UNION_CANONICAL);

/** `{x: integer, y: string}` — P8b's nested fragment, hoisted at the root today. */
const XY_FRAGMENT = {
  type: "object",
  properties: { x: { type: "integer" }, y: { type: "string" } },
  required: ["x", "y"],
  additionalProperties: false,
};
const XY_CANONICAL =
  '{"additionalProperties":false,"properties":{"x":{"type":"integer"},"y":{"type":"string"}},"required":["x","y"],"type":"object"}';
const XY_INLINE = inlineDefName(XY_CANONICAL);

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

// ===========================================================================
// The documents under assertion, assembled from the fragments above.
// ===========================================================================

/** SUBS-1 :81 over P1's two arms, each hoisted by :73 and referenced by :76. */
const P1_ROOT = {
  anyOf: [{ $ref: `#/$defs/${A_INT_INLINE}` }, { $ref: `#/$defs/${B_INT_INLINE}` }],
};
const P1_DEFS = { [A_INT_INLINE]: A_INT_FRAGMENT, [B_INT_INLINE]: B_INT_FRAGMENT };
const P1_DOCUMENT = { ...P1_ROOT, $defs: P1_DEFS };

/** The same over V4's three arms — the union splits on `|`, not on brace count. */
const V4_DOCUMENT = {
  anyOf: [
    { $ref: `#/$defs/${A_INT_INLINE}` },
    { $ref: `#/$defs/${B_INT_INLINE}` },
    { $ref: `#/$defs/${C_INT_INLINE}` },
  ],
  $defs: {
    [A_INT_INLINE]: A_INT_FRAGMENT,
    [B_INT_INLINE]: B_INT_FRAGMENT,
    [C_INT_INLINE]: C_INT_FRAGMENT,
  },
};

/** P7 — an arm that itself carries a nested object, so the hoist is transitive. */
const P7_DOCUMENT = {
  anyOf: [{ $ref: `#/$defs/${X_PQ_INLINE}` }, { $ref: `#/$defs/${Y_STR_INLINE}` }],
  $defs: {
    [PQ_INLINE]: PQ_FRAGMENT,
    [X_PQ_INLINE]: X_PQ_FRAGMENT,
    [Y_STR_INLINE]: Y_STR_FRAGMENT,
  },
};

/** P1 with an unresolvable name in the second arm — element 2's lowering half. */
const GHOST_UNION_DOCUMENT = {
  anyOf: [{ $ref: `#/$defs/${A_INT_INLINE}` }, { $ref: `#/$defs/${B_GHOST_INLINE}` }],
  $defs: { [A_INT_INLINE]: A_INT_FRAGMENT, [B_GHOST_INLINE]: B_GHOST_FRAGMENT },
};

/**
 * The bytes `respondSchemaSlug` names the respond tool from today, hashed from
 * a HAND-WRITTEN fragment rather than from the lowerer, so group (d)'s
 * inequality assertion cannot be satisfied by a change to the slug recipe.
 */
const MISPARSED_ROOT_FRAGMENT: LoweredSchema = {
  type: "object",
  properties: { a: { anyOf: [{}, {}] } },
  required: ["a"],
  additionalProperties: false,
};
const MISPARSED_ROOT_SLUG = "81e7d0e308042785";

// ===========================================================================
// Fixtures and load helpers. Loud on every unexpected disposition.
// ===========================================================================

/** A declaration every fixture carries, so a silent walk is never an EMPTY resolution set. */
const TRIAGE_BODY = "schema Triage { urgent: boolean }\n";

/** The resolution set the direct walker rows resolve against. */
const TRIAGE_SET = new Set(["Triage"]);

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
 * it (`schemaDeclsOf`, src/extension/production-theta-producer.ts:4983, which
 * filters `doc.body.statements`; the document's own `schemas` property is
 * absent for an alias-form declaration and would silently yield an empty set).
 * A body that fails to load throws with its diagnostics rendered, so a broken
 * fixture never reads as a lowering result.
 */
function schemaDeclsOf(body: string): readonly SchemaDecl[] {
  const doc = parseDoc(bodySrc(body), "bug0053.theta");
  if (doc.diagnostics.length > 0) {
    throw new Error(
      `harness: the decl body must load cleanly, but produced ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The `schema Triage { urgent: boolean }` declaration set an inline annotation resolves against. */
const TRIAGE_DECLS = schemaDeclsOf(`${TRIAGE_BODY}let x = 1\n`);

/**
 * The lowered response schema for an annotation, or a loud failure.
 * `undefined` is reserved for the EMPTY annotation alone, so it is a harness
 * error here rather than a fixture outcome.
 */
function loweredAnnotation(
  label: string,
  annotation: string,
  decls: readonly SchemaDecl[] = TRIAGE_DECLS,
): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, decls);
  if (lowered === undefined) {
    throw new Error(
      `${label}: \`@<${annotation}>\` lowered to nothing, so QRY-22 would bind an UNVALIDATED response; only the empty annotation may lower to undefined`,
    );
  }
  return lowered;
}

/** A parsed, cleanly-lowered `params:` block. */
interface LoadedParams {
  readonly defs: Record<string, unknown>;
  readonly loweredSchema: LoweredSchema;
}

/**
 * Parse a fixture that must LOAD, and read its lowered `params:` schema back.
 * Every absent intermediate — a `null` frontmatter, an absent `params`, an
 * absent `loweredSchema` — throws with the diagnostics rendered.
 */
function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0053.theta");
  expect(
    diagLines(doc),
    `${label}: this declaration is legal theta (grammar.md:94/:101), so the fixture must load with NO diagnostics; observed ${JSON.stringify(diagLines(doc))}`,
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
  return { defs: (lowered["$defs"] ?? {}) as Record<string, unknown>, loweredSchema: lowered };
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
 * Every `$ref` in a document resolves against the DOCUMENT ROOT's `$defs`. A
 * hoisted `__inline_<slug>` name has no `bodies` entry, so an arm hoisted at
 * the root without the matching closure leaves a dangling pointer AJV refuses
 * with `MissingRefError`; this check names the missing entry before the
 * compile does.
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

describe("bug 0053 (0) — the independent slug oracle", () => {
  const cases: ReadonlyArray<readonly [string, string, unknown]> = [
    ["`{a: integer}`", A_INT_CANONICAL, A_INT_FRAGMENT],
    ["`{b: integer}`", B_INT_CANONICAL, B_INT_FRAGMENT],
    ["`{c: integer}`", C_INT_CANONICAL, C_INT_FRAGMENT],
    ["P7 inner `{p: integer, q: boolean}`", PQ_CANONICAL, PQ_FRAGMENT],
    ["P7 arm `{x: {p: integer, q: boolean}}`", X_PQ_CANONICAL, X_PQ_FRAGMENT],
    ["`{y: string}`", Y_STR_CANONICAL, Y_STR_FRAGMENT],
    ["`{b: Ghost}` (permissive `b`)", B_GHOST_CANONICAL, B_GHOST_FRAGMENT],
    ["ARRAY-NESTING `{m: {a: integer} | {b: integer}}`", M_UNION_CANONICAL, M_UNION_FRAGMENT],
    ["`{x: integer, y: string}`", XY_CANONICAL, XY_FRAGMENT],
    ["SORT `{y: integer, x: string}`", SORT_CANONICAL, SORT_FRAGMENT],
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
      `every distinct fragment must produce a distinct slug, or an arm-identity claim below would be vacuous; observed ${JSON.stringify(slugs)}`,
    ).toBe(cases.length);
  });

  it("ORACLE CROSS-CHECK: the recipe reproduces four slugs production mints TODAY", () => {
    // Taken from production output rather than from `schemaSlug` directly. The
    // first comes from the ANNOTATION ROOT's own single-enclosing-group route,
    // which this bug leaves untouched; the other three are from the `params:`
    // position — the second is that position's own single-enclosing-group
    // mint (bug 0097 §Fix moved the UNION case off this position, not the
    // single-group one, so this cross-check still drives a production
    // reference here); the third is the ARRAY-NESTING form, the P1 union sunk
    // one level as a single group's field type, which is the only case here
    // whose canonical form carries an array of objects and so the only one
    // that scores §Canonical schema hash `:104`'s element-order rule against
    // production; the fourth is a declaration whose fields are declared `y`
    // then `x`, so a recipe that left `properties` in declaring order — or
    // that sorted `required` — would mint a different name.
    const nested = loweredAnnotation("CROSS-CHECK P8b", "{a: integer, b: {x: integer, y: string}}");
    expect(
      Object.keys((nested["$defs"] ?? {}) as Record<string, unknown>),
      `the annotation root hoists the nested object under the name the oracle derives; observed ${JSON.stringify(nested)}`,
    ).toEqual([XY_INLINE]);

    const singleGroup = loadCleanly(
      "CROSS-CHECK params",
      paramsSrc(`  p: "{a: integer}"`, `${TRIAGE_BODY}let x = 1\n`),
    );
    expect(
      Object.keys(singleGroup.defs),
      `the \`params:\` position's own single-enclosing-group mint, unmoved by bug 0097 §Fix; observed ${JSON.stringify(singleGroup.defs)}`,
    ).toEqual([A_INT_INLINE]);

    const arrayNesting = loadCleanly(
      "CROSS-CHECK ARRAY-NESTING",
      paramsSrc(`  p: "{m: {a: integer} | {b: integer}}"`, `${TRIAGE_BODY}let x = 1\n`),
    );
    expect(
      Object.keys(arrayNesting.defs),
      `the enclosing group hoists over both arm fragments, and its slug hashes the \`anyOf\` ARRAY holding them; observed ${JSON.stringify(arrayNesting.defs)}`,
    ).toEqual([A_INT_INLINE, B_INT_INLINE, M_UNION_INLINE]);
    expect(
      arrayNesting.defs[M_UNION_INLINE],
      "the hoisted fragment keeps its `anyOf` elements in LOWERING order, which is the order the hand-written canonical form hashes",
    ).toEqual(M_UNION_FRAGMENT);

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
// (a) THE INVARIANCE CONTROLS — every shape bug 0053 §Fix leaves byte-unchanged
// at the ANNOTATION ROOT: a1–a5 and a7–a8. GREEN at HEAD and green after, they
// bound that change to a source whose index-0 `{` does NOT close at the final
// index. a6 is the one row here driving a DIFFERENT position: it carries the
// `params:` position's bytes for the union, which bug 0097 §Fix moves onto this
// file's P1 document, so it is labelled PARITY rather than CONTROL. Asserted
// first so a red below names the defect rather than a broken control.
// ===========================================================================

describe("bug 0053 (a) — the shapes the root dispatch keeps byte-for-byte, and the `params:` parity row", () => {
  it("CONTROL (a1, fixture P8): a single enclosing brace group stays OBJECT-rooted, not a $ref", () => {
    // §Fix "The single-group root is byte-unchanged": the annotation root is
    // the one position where the inline-object fragment IS the document root,
    // so the structural predicate must keep this source on the
    // `lowerInlineObject` route rather than hoisting it the way a field
    // position would.
    const lowered = loweredAnnotation("P8", "{a: integer, b: string}");
    expect(
      lowered,
      `bug 0053 §Affected "Not affected": an annotation that IS one enclosing brace group; observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { a: { type: "integer" }, b: { type: "string" } },
      required: ["a", "b"],
      additionalProperties: false,
    });
  });

  it("CONTROL (a2, fixture P8b): a single group carrying a NESTED object keeps its object root and its one hoist", () => {
    const lowered = loweredAnnotation("P8b", "{a: integer, b: {x: integer, y: string}}");
    expect(
      lowered,
      `bug 0039's post-fix bytes for this source; the union split must not reach a source with no top-level \`|\`; observed ${JSON.stringify(lowered)}`,
    ).toEqual({
      type: "object",
      properties: { a: { type: "integer" }, b: { $ref: `#/$defs/${XY_INLINE}` } },
      required: ["a", "b"],
      additionalProperties: false,
      $defs: { [XY_INLINE]: XY_FRAGMENT },
    });
    expectRefsClosed("P8b", lowered);
  });

  it("CONTROL (a3, fixture G5): the empty annotation root keeps its present disposition", () => {
    // `{}` is a single enclosing brace group — its index-0 `{` closes at the
    // final index — so the structural predicate answers exactly as the
    // positional one does. grammar.md:109's `empty-schema-body` rule refuses
    // this shape at parse (bug 0045 §Fix), so a LOADING theta never reaches
    // here; this cell drives the seam directly, below the parse gate, and bug
    // 0045 owns the disposition.
    const lowered = loweredAnnotation("G5", "{}");
    expect(
      lowered,
      `bug 0053 §Non-goals: the empty inline object is bug 0045's, not this report's; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ type: "object", properties: {}, required: [], additionalProperties: false });
  });

  it("CONTROL (a4): a NAMED annotation resolves before the brace test and is untouched", () => {
    // The named arm (src/runtime/query-schema-lowering.ts:133–138) already
    // returns the SUBS-1 document for this union, which is what makes the
    // parity pin in group (c) a claim about ONE side moving.
    const decls = schemaDeclsOf(
      `${TRIAGE_BODY}schema X = {a: integer} | {b: integer}\nlet x = 1\n`,
    );
    const lowered = loweredAnnotation("named X", "X", decls);
    expect(
      lowered,
      `schema-subset.md:81 per arm, :73/:76 per hoist — the named spelling's bytes; observed ${JSON.stringify(lowered)}`,
    ).toEqual(P1_DOCUMENT);
    expectRefsClosed("named X", lowered);
  });

  it("CONTROL (a5): the SHREDDED segment set keeps its per-segment permissive `anyOf`", () => {
    // `{ a: string | null } | Cat` splits into `{ a: string`, `null }`, `Cat`,
    // none of them brace-balanced, so `isBraceBalanced`
    // (src/parser/params.ts:1062) refuses the arm path and every
    // segment lowers permissively. Bug 0039 §Fix constraint 1 admits a
    // permissive lowering and forbids a wrong one, so converting this would be
    // a regression rather than an improvement.
    const lowered = loweredAnnotation("SHRED", "{ a: string | null } | Cat");
    expect(
      lowered,
      `bug 0053 §Non-goals: the shredded segment set is bug 0033 §Fix residual (ii)'s subject; observed ${JSON.stringify(lowered)}`,
    ).toEqual({ anyOf: [{}, {}, {}] });
  });

  it("PARITY (a6, bug 0097 §Fix): the `params:` position mints the SAME document the root does", () => {
    // NOT an invariance control: this row's bytes are the ones bug 0097 §Fix
    // moves, which is why it carries that report's label rather than group
    // (a)'s. Bug 0097 §Fix lifts bug 0053 §Non-goals' freeze on `lowerParamsFieldType`
    // for exactly this class — a top-level union of brace-balanced arms with
    // at least one brace-group arm — by routing it through the identical
    // `isSingleEnclosingBraceGroup` / `lowerBraceGroupUnionArms` pair
    // (src/parser/params.ts) this file's own root dispatch already uses, so
    // the `params:` document's arm fragments are byte-equal to the annotation
    // root's (P1_DOCUMENT above), under identical minted names — the parity
    // type-system.md:15 promises. `tests/params-inline-object-lowering.test.ts`
    // still locks every source with no top-level `|`, which this class is not.
    const loaded = loadCleanly(
      "params P1",
      paramsSrc(`  p: "{a: integer} | {b: integer}"`, `${TRIAGE_BODY}let x = 1\n`),
    );
    expect(
      loaded.loweredSchema,
      `the \`params:\` document's arm fragments, byte-equal to the annotation root's; observed ${JSON.stringify(loaded.loweredSchema)}`,
    ).toEqual({
      type: "object",
      properties: { p: P1_ROOT },
      required: ["p"],
      additionalProperties: false,
      $defs: P1_DEFS,
    });
  });

  it("CONTROL (a7): the annotation carrying this union LOADS with no diagnostic", () => {
    // The other half of element 2's raise contract: correcting the walk must
    // not start refusing a union whose arms all resolve.
    const doc = parseDoc(bodySrc(annotationBody("{a: integer} | {b: integer}")), "bug0053.theta");
    expect(
      diagLines(doc),
      `grammar.md:94/:101 admit this annotation, so it must keep loading clean; observed ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([]);
  });

  it("CONTROL (a8): the slug recipe names the CURRENT root fragment `81e7d0e308042785`", () => {
    // Hashed from a hand-written fragment rather than from the lowerer, so
    // group (d)'s inequality assertion stays a claim about the LOWERING and
    // cannot be satisfied by a change to `respondSchemaSlug`.
    const slug = respondSchemaSlug(MISPARSED_ROOT_FRAGMENT);
    expect(
      slug,
      `src/runtime/typed-query-validation.ts:347 over the fragment the naive dispatch mints; observed ${slug}`,
    ).toBe(MISPARSED_ROOT_SLUG);
  });
});

// ===========================================================================
// (b) ELEMENT 1 — the `@<T>` annotation root. A top-level union of object arms
// is a union, and SUBS-1 :81 lowers it to `anyOf` over hoisted arms.
// RED at HEAD: every row lowers a one-field object whose field asserts nothing.
// ===========================================================================

describe("bug 0053 (b) — a top-level union of object arms at the `@<T>` root lowers `anyOf` over hoisted arms", () => {
  it("RED (b1, fixture P1): `@<{a: integer} | {b: integer}>` hoists BOTH arms and refs them in source order", () => {
    // The defect in one line: the root guard tests the first and last
    // CHARACTERS, so the first arm's `{` and the last arm's `}` are read as one
    // group and `a: integer} | {b: integer` is handed to `lowerInlineObject` as
    // a field list. The expected document is the one the same lowerer already
    // produces for this text at every position that consults
    // `isSingleEnclosingBraceGroup` — and the one `@<X>` produces for the named
    // spelling (control a4).
    const lowered = loweredAnnotation("P1", "{a: integer} | {b: integer}");
    expect(
      lowered,
      `schema-subset.md:81 (SUBS-1) — a union with a non-primitive arm lowers to \`anyOf\`, arms in source order; :73/:76 hoist each object arm under \`__inline_<slug>\`; observed ${JSON.stringify(lowered)}`,
    ).toEqual(P1_DOCUMENT);
    expect(
      lowered["required"],
      `a union root declares no required property: \`required\` belongs to each ARM's fragment, not to the document root; observed ${JSON.stringify(lowered["required"])}`,
    ).toBeUndefined();
    expectRefsClosed("P1", lowered);
  });

  it("RED (b2, fixtures V1/V2/V3): leading space, trailing space and no space around `|` all reach the same document", () => {
    // The dispatch reads the trimmed source's endpoints, so spacing cannot be
    // what decides a lowering; pinning the three spellings together keeps a fix
    // from closing one of them.
    for (const [label, annotation] of [
      ["V1 — a leading space", " {a: integer} | {b: integer}"],
      ["V2 — a trailing space", "{a: integer} | {b: integer} "],
      ["V3 — no space around the `|`", "{a: integer}|{b: integer}"],
    ] as const) {
      const lowered = loweredAnnotation(label, annotation);
      expect(
        lowered,
        `${label}: grammar.md:94 does not read whitespace, so this spelling lowers exactly as P1 does; observed ${JSON.stringify(lowered)}`,
      ).toEqual(P1_DOCUMENT);
    }
  });

  it("RED (b3, fixture V4): a THIRD object arm hoists too — arm count is not the axis", () => {
    const lowered = loweredAnnotation("V4", "{a: integer} | {b: integer} | {c: integer}");
    expect(
      lowered,
      `schema-subset.md:81 — every arm of the union, in source order; observed ${JSON.stringify(lowered)}`,
    ).toEqual(V4_DOCUMENT);
    expectRefsClosed("V4", lowered);
  });

  it("RED (b4, fixture P7): an arm carrying a NESTED object hoists transitively and mints no phantom field", () => {
    // One nesting level deeper than P1. The mis-parsed interior
    // `x: {p: integer, q: boolean}} | {y: string` yields the single field `x`
    // whose type is two shards; the declared shape is two arms, the first of
    // which hoists its own nested fragment, so the document carries THREE
    // `$defs` entries and two `$ref`s at the root.
    const lowered = loweredAnnotation("P7", "{x: {p: integer, q: boolean}} | {y: string}");
    expect(
      lowered,
      `schema-subset.md:73 applies in ANY type position and at any depth, so the arm's own nested object hoists with it; observed ${JSON.stringify(lowered)}`,
    ).toEqual(P7_DOCUMENT);
    expect(
      Object.keys((lowered["$defs"] ?? {}) as Record<string, unknown>).sort(),
      `three fragments close this document: each arm and the arm's nested object; observed ${JSON.stringify(Object.keys((lowered["$defs"] ?? {}) as Record<string, unknown>))}`,
    ).toEqual([PQ_INLINE, X_PQ_INLINE, Y_STR_INLINE].sort());
    expectRefsClosed("P7", lowered);
  });
});

// ===========================================================================
// (c) THE PARITY PIN — type-system.md:15 as an executable claim. One type
// expression, two spellings, one document.
// RED at HEAD: the inline spelling mis-parses; the named spelling is correct.
// ===========================================================================

describe("bug 0053 (c) — the inline and named spellings of one union lower identically", () => {
  it("RED (c1, fixtures P1/P3b): `@<{a: integer} | {b: integer}>` deep-equals `@<X>` for `schema X = {a: integer} | {b: integer}`", () => {
    // The decisive contrast of the report: the named spelling routes through
    // `buildBodyTypeSchemas` and the alias RHS's per-arm union path
    // (`lowerBraceGroupUnionArms`, src/parser/params.ts:1140, reached from
    // `lowerTypeSource`'s call site at src/parser/body-type-lowering.ts:315),
    // the inline spelling through the root brace dispatch, and the two
    // disagree only because the dispatch runs first and never consults the
    // structural predicate the shared lowering owns. type-system.md:15 is what
    // an author relies on when moving a type expression between positions.
    const declBody = `${TRIAGE_BODY}schema X = {a: integer} | {b: integer}\nlet x = 1\n`;
    const decls = schemaDeclsOf(declBody);
    expect(
      decls.map((d) => d.name),
      `harness: the fixture must declare exactly \`Triage\` and \`X\`, or the named spelling resolves against nothing; observed ${JSON.stringify(decls.map((d) => d.name))}`,
    ).toEqual(["Triage", "X"]);

    const named = loweredAnnotation("P3b — the named spelling", "X", decls);
    const inline = loweredAnnotation(
      "P1 — the inline spelling",
      "{a: integer} | {b: integer}",
      decls,
    );
    expect(
      inline,
      `type-system.md:15 — one type grammar in every annotation position, so the inline spelling must lower to the bytes the named spelling lowers to; named=${JSON.stringify(named)} inline=${JSON.stringify(inline)}`,
    ).toEqual(named);
  });
});

// ===========================================================================
// (d) QRY-22 AND THE WIRE — the consequence at the response boundary, through
// the production `AjvSchemaValidator` and the respond tool's registration.
// RED at HEAD: `{"b":1}` is refused and `{"a":null}` binds, both inverted; the
// wire schema is the mis-parsed fragment verbatim under the pre-fix tool name.
// ===========================================================================

describe("bug 0053 (d) — the corrected root admits exactly the declared arms and crosses to the envelope", () => {
  it("RED (d1): the real AJV accept/reject table over the corrected annotation root", () => {
    const lowered = loweredAnnotation("P1", "{a: integer} | {b: integer}");
    const { validator, emitted } = ajv();
    const compiled = validator.compile(lowered);
    for (const [label, payload, ok] of [
      ["the first arm's shape", { a: 1 }, true],
      ["the SECOND arm's shape — the author declared it and today it is refused", { b: 1 }, true],
      ["a wrong type in the first arm's field", { a: "not an integer" }, false],
      ["an object where the first arm declares an integer", { a: { deep: true } }, false],
      ["null where the first arm declares an integer", { a: null }, false],
      ["both arms' fields at once", { a: 1, b: 1 }, false],
      ["neither arm's shape", { c: 3 }, false],
    ] as const) {
      const result = compiled.validate(payload);
      expect(
        result.ok,
        `${label}: QRY-22 (query-failure-and-repair.md:78) validates the reply against the DECLARED shape, and a two-arm union of object types admits exactly its arms; payload=${JSON.stringify(payload)} observed ${JSON.stringify(result)}`,
      ).toBe(ok);
    }
    expect(
      emitted.map((d) => d.code),
      `the corrected document must compile without a validator diagnostic; observed ${JSON.stringify(emitted)}`,
    ).toEqual([]);
  });

  it("RED (d2): the corrected root is not argument-object-satisfiable, so the respond tool registers under the `value` envelope", () => {
    // An `anyOf` root is one of the forms `rootIsArgumentObjectSatisfiable`
    // (src/runtime/respond-tool-wire.ts:55–70) refuses, so the wire schema
    // gains the single-property envelope and `$defs` lifts to the envelope
    // root — QRY-15's initial instruction and QRY-12's follow-ups carry it with
    // them (query-tool-loop.md:20/:37).
    const lowered = loweredAnnotation("P1", "{a: integer} | {b: integer}");
    expect(
      respondSchemaIsEnveloped(lowered),
      `a union root cannot be delivered as a tool call's argument object; observed lowered=${JSON.stringify(lowered)}`,
    ).toBe(true);
    const wire = respondToolWireSchema(lowered);
    expect(
      wire,
      `src/runtime/respond-tool-wire.ts:91 — the payload sits at \`value\` and the arms' fragments lift to the envelope root so their \`$ref\`s resolve; observed ${JSON.stringify(wire)}`,
    ).toEqual({
      type: "object",
      properties: { value: P1_ROOT },
      required: ["value"],
      $defs: P1_DEFS,
    });
    expectRefsClosed("P1 wire", wire);
  });

  it("RED (d3): the registered respond-tool name moves off the mis-parsed fragment's slug and stays stable", () => {
    // §Fix constraint: "The registered tool name changes with the bytes." The
    // post-fix slug is deliberately NOT hand-guessed — the claim is that the
    // name is no longer the one the mis-parsed fragment mints (control a8
    // pins that value independently), and that one input still yields one name
    // so the PIC-44 registration cache and the QRY-12/QRY-15 templates agree.
    const lowered = loweredAnnotation("P1", "{a: integer} | {b: integer}");
    const slug = respondSchemaSlug(lowered);
    expect(
      slug,
      `src/runtime/typed-query-validation.ts:194/:347 names \`__theta_respond_<slug>\` from the lowered bytes, so a corrected lowering cannot keep the mis-parsed fragment's name; observed ${slug}`,
    ).not.toBe(MISPARSED_ROOT_SLUG);
    expect(
      slug,
      `one recipe names the registration, the presented tool entry and both conveyance templates, so the same annotation must yield one name; observed ${slug}`,
    ).toBe(respondSchemaSlug(loweredAnnotation("P1 again", "{a: integer} | {b: integer}")));
  });
});

// ===========================================================================
// (e) ELEMENT 2 — the name walk. `collectUnresolvedNamedTypes` carries the same
// predicate, so a `NamedType` inside either arm resolves against nothing and
// raises nothing at the `@<T>` annotation and the alias RHS both.
// RED at HEAD: the brace-rooted rows return `[]` and load clean.
// ===========================================================================

describe("bug 0053 (e) — a name inside a union ARM raises unresolved-named-type at both emitting positions", () => {
  /** The single rendered line each position must produce for the ghost name. */
  const EXPECTED = [unresolvedLine("Ghost")];

  it("CONTROL (e0): the reference spellings already raise, at the walker and at both positions", () => {
    // Asserted FIRST so a red below names the defect rather than a broken
    // control. Appending ` | integer` to the same source removes the trailing
    // `}`; writing the primitive arm first removes the leading `{`. Either
    // routes the source through `lowerTypeSource` and the name is seen. These
    // are the bytes §Fix requires the brace-rooted spelling to match.
    expect(
      collectUnresolvedNamedTypes("integer | {b: Ghost}", TRIAGE_SET),
      "the walker's reference row: a primitive first arm keeps the source off the naive dispatch",
    ).toEqual(["Ghost"]);
    expect(
      collectUnresolvedNamedTypes("{a: integer} | {b: Ghost} | integer", TRIAGE_SET),
      "the same union with a primitive arm appended — the trailing `}` is gone and the arms are walked",
    ).toEqual(["Ghost"]);
    expect(
      collectUnresolvedNamedTypes("{a: integer, b: Ghost}", TRIAGE_SET),
      "a genuine single enclosing brace group reaches its fields",
    ).toEqual(["Ghost"]);

    for (const [label, source] of [
      [
        "the `@<T>` annotation, primitive arm first",
        bodySrc(annotationBody("integer | {b: Ghost}")),
      ],
      [
        "the `@<T>` annotation, primitive arm appended",
        bodySrc(annotationBody("{a: integer} | {b: Ghost} | integer")),
      ],
      [
        "the alias RHS, primitive arm first",
        paramsSrc("  s: X", `${TRIAGE_BODY}schema X = integer | {b: Ghost}\nlet x = 1\n`),
      ],
      [
        "the alias RHS, primitive arm appended",
        paramsSrc(
          "  s: X",
          `${TRIAGE_BODY}schema X = {a: integer} | {b: Ghost} | integer\nlet x = 1\n`,
        ),
      ],
    ] as const) {
      const doc = parseDoc(source, "bug0053.theta");
      expect(
        diagLines(doc),
        `${label}: code-registry-parse.md:90 lists this position, at error severity; observed ${JSON.stringify(diagLines(doc))}`,
      ).toEqual(EXPECTED);
    }
  });

  it("RED (e1): `collectUnresolvedNamedTypes` walks INTO each brace-rooted union arm", () => {
    // The walker collects names BY lowering, so it reproduces whatever the
    // dispatch does with the source. Both orientations are pinned: the ghost in
    // the second arm and the ghost in the first, so a fix cannot close one
    // position of the source and leave the other.
    for (const [label, source] of [
      ["the ghost in the SECOND arm", "{a: integer} | {b: Ghost}"],
      ["the ghost in the FIRST arm", "{a: Ghost} | {b: integer}"],
    ] as const) {
      const names = collectUnresolvedNamedTypes(source, TRIAGE_SET);
      expect(
        names,
        `${label}: the walk must reach an ARM's field the same way it reaches a field of a single enclosing group; source=\`${source}\` observed ${JSON.stringify(names)}`,
      ).toEqual(["Ghost"]);
    }
  });

  it("RED (e2): the `@<T>` annotation position raises, byte-identical to the reference spelling", () => {
    const doc = parseDoc(bodySrc(annotationBody("{a: integer} | {b: Ghost}")), "bug0053.theta");
    expect(
      diagLines(doc),
      `code-registry-parse.md:90 position 2 — exactly one error naming \`Ghost\`, with the theta refused, byte-identical to what \`integer | {b: Ghost}\` renders here; observed ${JSON.stringify(diagLines(doc))}`,
    ).toEqual(EXPECTED);
  });

  it("RED (e3): the alias RHS position raises, byte-identical to the reference spelling", () => {
    const doc = parseDoc(
      paramsSrc("  s: X", `${TRIAGE_BODY}schema X = {a: integer} | {b: Ghost}\nlet x = 1\n`),
      "bug0053.theta",
    );
    expect(
      diagLines(doc),
      `code-registry-parse.md:90 position 4 (added by bug 0033) — the alias RHS lowers the arms correctly through \`buildBodyTypeSchemas\` while only the walker carries the naive dispatch; observed ${JSON.stringify(diagLines(doc))}`,
    ).toEqual(EXPECTED);
  });

  it("RED (e4): the annotation root's lowering of that same union hoists the arm holding the ghost name", () => {
    // The lowering half of element 2, which is what makes part A alone
    // insufficient: correcting the root without correcting the walk would give
    // this document a `$ref` to a fragment whose field lowers `{}` for a name
    // that resolves nowhere, with no diagnostic anywhere.
    const lowered = loweredAnnotation("GHOST union", "{a: integer} | {b: Ghost}");
    expect(
      lowered,
      `both arms hoist; \`b\` stays permissive because \`Ghost\` resolves to nothing, which is the documented unresolved-arm disposition; observed ${JSON.stringify(lowered)}`,
    ).toEqual(GHOST_UNION_DOCUMENT);
    expectRefsClosed("GHOST union", lowered);
  });
});
