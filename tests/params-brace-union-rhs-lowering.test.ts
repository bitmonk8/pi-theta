import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { buildBinderEnvelopeSchema } from "../src/binder/binder-envelope";
import type { BypassParamsField } from "../src/binder/binder-envelope";
import { renderBinderParamLine } from "../src/binder/binder-system-prompt";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0097 — the `params:` right-hand side keeps a naive
// `startsWith("{") && endsWith("}")` dispatch, so a top-level union of object
// arms is read as ONE inline field list
// (docs/bugs/0097-params-brace-union-rhs-one-field-list.md).
//
// ONE DISPATCH, TWO ELEMENTS.
//
//   THE DISPATCH. `lowerParamsFieldType` (`src/parser/params.ts`) tests
//   `s.startsWith("{") && s.endsWith("}")`. That question is
//   POSITIONAL — a `{` at index 0 and a `}` at the last index — not
//   STRUCTURAL, so `{a: integer} | {b: integer}` answers yes on its FIRST
//   arm's opening brace and its LAST arm's closing brace, and the whole source
//   goes to `hoistInlineObjectType` as a field list. The
//   other three type positions ask
//   `isSingleEnclosingBraceGroup` (src/parser/body-type-lowering.ts:214), a
//   depth walk that answers yes only when the index-0 `{` closes at the final
//   index; `lowerTypeSource` (`:373`) asks it of the whole source (`:442`) and
//   then of each `|` segment (`:446`–`:459`), and
//   `lowerQueryResponseSchema` (src/runtime/query-schema-lowering.ts:113) asks
//   the identical question of the annotation root (`:151`).
//
//   1. THE LOWERED FRAGMENT IS A SHAPE NOBODY WROTE. The mis-read interior
//      `a: integer} | {b: integer` yields the single field `a` whose type
//      source is the two shards `integer}` and `{b: integer`, neither a
//      `Type`, so the minted fragment is
//      `{"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],"additionalProperties":false}`.
//      It REQUIRES the first arm's field, constrains it to nothing, and
//      refuses the second arm outright — and that fragment is the whole
//      enforcement the argument boundary gets. Groups (b), (c), (f).
//   2. A `NamedType` INSIDE AN ARM RAISES NOTHING AT THIS POSITION. The
//      `params:` position reports whatever its own lowering appended to
//      `lowerCtx.unresolved` (`src/parser/params.ts`, `parseParams`'s
//      diagnostic loop). A name lost inside the mis-parsed field's shredded
//      type text never reaches `lowerTypeExpr`'s identifier arm, so nothing is
//      appended and nothing is reported. Groups (d), (e).
//
// SPEC ANCHORS (the contract, not the current code; every line re-derived at
// HEAD a1eec82c / 0.98.0):
//   - docs/spec_topics/grammar.md:94 — `Type "|" Type`, recursive; `:101` —
//     `ObjectType` is a `Type`. `{a: integer} | {b: integer}` is a TWO-ARM
//     union of object types, not one object type. `:105` names "`params:`
//     field types" among the bare-`Type` positions and adds that "the grammar
//     is otherwise identical in every position"; `:109` makes an inline
//     object's field `Type` recursive and refuses the empty `{}` with
//     `theta/parse/empty-schema-body`.
//   - docs/spec_topics/type-system.md:15 — "The same type grammar applies in
//     every type-annotation position: schema fields, frontmatter `params:`,
//     `let x: T`, function parameters, and `@<T>`". One grammar and one
//     emission table give one answer per type expression.
//   - docs/spec_topics/schema-subset.md:81 (SUBS-1) — a union with a
//     non-primitive arm lowers to `{"anyOf": [...]}`, arms in source order;
//     `:82` names the object-union case; `:73` (step 2) hoists each inline
//     object arm under `__inline_<slug>`, collapsing two arms to one entry
//     exactly when their lowered fragments are byte-identical; `:76` (step 3)
//     emits `{"$ref": "#/$defs/<Name>"}` at the use; `:85` fixes array element
//     order; `:98` makes the slug a function of the LOWERED fragment, which is
//     what makes one source text mint one name at every position.
//   - :92–:108 §Canonical schema hash — the slug recipe the oracle below
//     implements by hand (code-point-sorted object keys `:100`, no
//     insignificant whitespace `:101`, array elements left in lowering order
//     `:104`, RFC 8259 minimal escapes `:105`, SHA-256 `:106`, first 16
//     lowercase hex characters `:107`, `__inline_<slug>` `:108`).
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:57 — "`params` are
//     validated with AJV at invocation time"; `:58` — "Each `params:` field's
//     right-hand side is a type expression parsed by the theta type grammar —
//     the same grammar used in every other type-annotation position", and the
//     brace-frame exemption that governs group (e): a fragment carrying a `{`
//     or `}` keeps its own lowering, while "a brace-free fragment reached
//     through a hoisted inline object's field type is refused like any other".
//   - docs/spec_topics/diagnostics/code-registry-parse.md:94 — the
//     `theta/parse/unresolved-named-type` row: five positions, the `params:`
//     right-hand side named FIRST, error severity, theta not registered. No
//     registry edit is needed; `:88` is the `empty-schema-body` row and `:91`
//     the `schema-type-not-expression` row, and
//     docs/spec_topics/diagnostics/code-registry-load.md:19 is the
//     `theta/load/params-type-not-expression` row whose brace-frame decline
//     group (e) pins.
//   - docs/spec_topics/governance/source-language-stability.md:5 (GOV-15) and
//     `:25` (the diagnostic-registry carve-out) — the newly-refused typo
//     inputs in groups (d)/(e) are a covered trigger change within a 1.x minor.
//
// PROBED CURRENT SIGNATURES (HEAD a1eec82c / 0.98.0, offline, deterministic).
// Body fixture `schema Triage { urgent: boolean }` + `let x = 1`; frontmatter
// `mode: prompt` plus the single `params:` entry shown. `Ghost` is declared
// nowhere; `???` spells no `Type`.
//   p: "{a: integer} | {b: integer}"   diags []  properties.p
//        {"$ref":"#/$defs/__inline_abb2fcd8521f6115"} over
//        {"a":{"anyOf":[{},{}]}} — and the leading-space, trailing-space and
//        no-space spellings are byte-identical to it
//   p: "{a: integer} | {b: integer} | {c: integer}"  __inline_6c815aa05d43014d
//   p: "{m: {a: integer} | {b: integer}}"  __inline_ae08c181bf6be6f8 over
//        __inline_abb2fcd8521f6115 — the NESTED-DEPTH member: the enclosing
//        group takes the correct single-group hoist, and its slug hashes the
//        field's mis-parse, so the enclosing name moves with the field's
//   p: "{x: {p: integer, q: boolean}} | {y: string}" __inline_89c169adb6920a28
//   p: "{ a: string | null } | {b: integer}"         __inline_62ad2038df56024e
//   p: "{a: integer} | integer}"                     __inline_1b7dfa57724a007e
//   p: "integer | {b: integer}"      {"anyOf":[{"type":"integer"},{}]}
//   p: "{a: integer} | Triage"       {"anyOf":[{},{"$ref":"#/$defs/Triage"}]}
//   p: "{a: integer} | {b: integer} | integer"  {"anyOf":[{},{},{"type":"integer"}]}
//   AJV over the first row: {"p":{"a":1}} ACCEPT · {"p":{"b":1}} REFUSE ·
//        {"p":{"a":null}} ACCEPT · {"p":{"a":"not an integer"}} ACCEPT ·
//        {"p":{"a":{"deep":true}}} ACCEPT · {"p":{"a":1,"b":1}} REFUSE ·
//        {"p":{"c":3}} REFUSE · {"p":7} REFUSE
//   element 2 at `params:`  {a: Ghost} | {b: integer} :: []
//        {a: Ghost} | Triage :: []   integer | {b: Ghost} :: []
//        {a: Ghost} :: ONE unresolved-named-type
//   the same three sources at `@<T>`, at a `schema X = …` alias RHS and at a
//        `schema` body field type :: ONE unresolved-named-type each
//   binder  BypassParamsField {"wireName":"p","type":"{a: integer} | {b: integer}",
//        "hasDefault":false,"nullable":false} · envelope ok.args.properties.p
//        {"$ref":"#/$defs/__inline_abb2fcd8521f6115"}, that fragment under the
//        ENVELOPE-root $defs
//
// WHAT IS RED HERE: groups (b), (c), (f), the `params:` rows of (d), and (e).
// Groups (0) and (a) are GREEN at HEAD and must stay green byte-for-byte —
// they are what bounds the fix to a source whose index-0 `{` does not close at
// the final index — as are (d)'s CONTROL rows and (e)'s sibling-position pins.
// Group (a) is asserted first so a red below names the defect rather than a
// broken control.
//
// THE `schema` BODY FIELD POSITION carries no row in the LOWERED-BYTES parity
// table (group (b)) by bug 0097 §Non-goals, which leaves that position to bug
// 0095. It does carry rows in the DIAGNOSTIC tables (groups (d)/(e)), where
// bug 0095 §Fix is the authority for its present disposition: the union
// sources below raise `theta/parse/unresolved-named-type` there, not
// `theta/parse/empty-schema-body`.
//
// THE SLUG ORACLE IS INDEPENDENT. `schemaSlug` (src/parser/schema-lowering.ts)
// is deliberately NOT imported: an oracle taken from the implementation under
// test proves nothing. Every expected `__inline_<slug>` below is derived from a
// HAND-WRITTEN canonical-form string following the §Canonical schema hash
// recipe, hashed with `node:crypto`. Group (0) keeps those strings honest three
// ways: parse-back equality against the fragment each claims to serialise, a
// whitespace and key-sort check, and a CROSS-CHECK against slugs production
// mints TODAY at positions this fix does not move.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one function call — `parseThetaDocument` over a string, or one direct
// `lowerQueryResponseSchema` call — plus one real AJV compile and one envelope
// build over the document that call produces. An integration or live tier can
// observe neither of the two things under assertion: a diagnostic's PRESENCE
// (and its exact multiplicity) at load, and the exact `$defs` bytes and minted
// names of a lowering. A provider round-trip would add stochastic surface to a
// contract fully determined at the lowering boundary. `parseDoc`
// (tests/helpers/e2e-s1.ts) is the shipped load path wrapped in the standard
// inert `parseDeps` double, and is the harness the bug doc's own §Reproduction
// used.
//
// NO SILENT SKIPPING: every fixture that must load asserts its diagnostic list
// and then fails LOUDLY — diagnostics rendered — if the frontmatter, the params
// block or the lowered schema is absent. A refused parse can never be mistaken
// for a pass, and every refusal cell asserts the EXACT diagnostic list rather
// than mere non-emptiness.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

const UNRESOLVED = "theta/parse/unresolved-named-type";
const EMPTY_SCHEMA_BODY = "theta/parse/empty-schema-body";
const PARAMS_NOT_EXPRESSION = "theta/load/params-type-not-expression";
const SCHEMA_NOT_EXPRESSION = "theta/parse/schema-type-not-expression";

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
 * The registry row's normative *Message* template for `code`, with its single
 * `placeholder` replaced by `value`. Definedness AND placeholder presence are
 * asserted first, so a missing row — or a template that lost its placeholder —
 * reds by naming the registry rather than by a bare `undefined` comparison or a
 * silently unsubstituted string.
 */
function registryLine(code: string, placeholder: string, value: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
  expect(
    template,
    `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
  ).toContain(placeholder);
  return `error ${code}: ${(template as string).replace(placeholder, value)}`;
}

/** The one rendered line an unresolvable `NamedType` produces (registry row `:94`). */
function unresolvedLine(name: string): string {
  return registryLine(UNRESOLVED, "<name>", name);
}

/** The one rendered line an empty inline object type produces (registry row `:88`). */
function emptySchemaBodyLine(subject: string): string {
  return registryLine(EMPTY_SCHEMA_BODY, "<X>", subject);
}

/** The one rendered line a non-`Type` `params:` fragment produces (load registry row `:19`). */
function paramsNotExpressionLine(param: string): string {
  return registryLine(PARAMS_NOT_EXPRESSION, "<param>", param);
}

/** The one rendered line a non-`Type` body-position fragment produces (registry row `:91`). */
function schemaNotExpressionLine(decl: string): string {
  return registryLine(SCHEMA_NOT_EXPRESSION, "<X>", decl);
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

/** SHA-256 of the canonical-form bytes, first 16 lowercase hex characters (`:106`/`:107`). */
function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (`:73`/`:108`). */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}

/** `{a: integer}` — the first arm of the report's subject union. */
const A_INT_FRAGMENT = {
  type: "object",
  properties: { a: { type: "integer" } },
  required: ["a"],
  additionalProperties: false,
};
const A_INT_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"integer"}},"required":["a"],"type":"object"}';
const A_INT_INLINE = inlineDefName(A_INT_CANONICAL);

/** `{b: integer}` — the second arm, distinct from the first. */
const B_INT_FRAGMENT = {
  type: "object",
  properties: { b: { type: "integer" } },
  required: ["b"],
  additionalProperties: false,
};
const B_INT_CANONICAL =
  '{"additionalProperties":false,"properties":{"b":{"type":"integer"}},"required":["b"],"type":"object"}';
const B_INT_INLINE = inlineDefName(B_INT_CANONICAL);

/** `{c: integer}` — a third arm, which pins that arm COUNT is not the axis. */
const C_INT_FRAGMENT = {
  type: "object",
  properties: { c: { type: "integer" } },
  required: ["c"],
  additionalProperties: false,
};
const C_INT_CANONICAL =
  '{"additionalProperties":false,"properties":{"c":{"type":"integer"}},"required":["c"],"type":"object"}';
const C_INT_INLINE = inlineDefName(C_INT_CANONICAL);

/**
 * `{m: {a: integer} | {b: integer}}` — the NESTED-DEPTH member of the moved
 * class: the outer source IS a single enclosing brace group, so its ROUTE is
 * the unmoved hoist, while its one FIELD's type is the subject union, so the
 * fragment that hoist content-addresses carries the two arm `$ref`s. This is
 * the only canonical form in this file that nests objects INSIDE AN ARRAY, and
 * its two elements are distinct, so §Canonical schema hash `:104` ("array
 * elements left in lowering order") is distinguishable here from a recipe that
 * sorted them: `df817b794ef788ce` sorts AFTER `8cc8cb1e7074a3af`, and lowering
 * order puts it first.
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

/** `{p: integer, q: boolean}` — the innermost fragment of the nested-arm row. */
const PQ_FRAGMENT = {
  type: "object",
  properties: { p: { type: "integer" }, q: { type: "boolean" } },
  required: ["p", "q"],
  additionalProperties: false,
};
const PQ_CANONICAL =
  '{"additionalProperties":false,"properties":{"p":{"type":"integer"},"q":{"type":"boolean"}},"required":["p","q"],"type":"object"}';
const PQ_INLINE = inlineDefName(PQ_CANONICAL);

/** `{x: {p: integer, q: boolean}}` — an arm that itself carries a hoist. */
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

/** `{y: string}` — that row's second arm. */
const Y_STR_FRAGMENT = {
  type: "object",
  properties: { y: { type: "string" } },
  required: ["y"],
  additionalProperties: false,
};
const Y_STR_CANONICAL =
  '{"additionalProperties":false,"properties":{"y":{"type":"string"}},"required":["y"],"type":"object"}';
const Y_STR_INLINE = inlineDefName(Y_STR_CANONICAL);

/** `{a: integer, b: string}` — a CONTROL: one enclosing brace group, unmoved. */
const AB_FRAGMENT = {
  type: "object",
  properties: { a: { type: "integer" }, b: { type: "string" } },
  required: ["a", "b"],
  additionalProperties: false,
};
const AB_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"integer"},"b":{"type":"string"}},"required":["a","b"],"type":"object"}';
const AB_INLINE = inlineDefName(AB_CANONICAL);

/** `{x: integer, y: string}` — the CONTROL row's nested fragment. */
const XY_FRAGMENT = {
  type: "object",
  properties: { x: { type: "integer" }, y: { type: "string" } },
  required: ["x", "y"],
  additionalProperties: false,
};
const XY_CANONICAL =
  '{"additionalProperties":false,"properties":{"x":{"type":"integer"},"y":{"type":"string"}},"required":["x","y"],"type":"object"}';
const XY_INLINE = inlineDefName(XY_CANONICAL);

/** `{a: integer, b: {x: integer, y: string}}` — the CONTROL row's outer fragment. */
const A_XY_FRAGMENT = {
  type: "object",
  properties: { a: { type: "integer" }, b: { $ref: `#/$defs/${XY_INLINE}` } },
  required: ["a", "b"],
  additionalProperties: false,
};
const A_XY_CANONICAL =
  `{"additionalProperties":false,"properties":{"a":{"type":"integer"},` +
  `"b":{"$ref":"#/$defs/${XY_INLINE}"}},"required":["a","b"],"type":"object"}`;
const A_XY_INLINE = inlineDefName(A_XY_CANONICAL);

/** The closed lowering of `schema Triage { urgent: boolean }`. */
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};

// ===========================================================================
// The documents under assertion, assembled from the fragments above.
// ===========================================================================

/** SUBS-1 `:81` over the two arms, each hoisted by `:73` and referenced by `:76`. */
const UNION_ROOT = {
  anyOf: [{ $ref: `#/$defs/${A_INT_INLINE}` }, { $ref: `#/$defs/${B_INT_INLINE}` }],
};
const UNION_DEFS = { [A_INT_INLINE]: A_INT_FRAGMENT, [B_INT_INLINE]: B_INT_FRAGMENT };

/** The whole lowered `params:` document for the subject union. */
const UNION_PARAMS_DOCUMENT = {
  type: "object",
  properties: { p: UNION_ROOT },
  required: ["p"],
  additionalProperties: false,
  $defs: UNION_DEFS,
};

// ===========================================================================
// Fixtures and load helpers. Loud on every unexpected disposition.
// ===========================================================================

/** `Triage` is declared in every fixture; `Ghost` is declared nowhere. */
const BODY = "schema Triage { urgent: boolean }\nlet x = 1\n";

/** The `schema` declaration alone, for the bodies that add one of their own. */
const TRIAGE_BODY = "schema Triage { urgent: boolean }\n";

/**
 * A `mode: prompt` theta whose sole `params:` entry is `p: <rhs>`, delivered as
 * a YAML double-quoted scalar. A theta-side inline object carries theta-side
 * braces, so the quoting is what keeps the type expression a scalar rather
 * than a YAML flow mapping; the quoted text reaches the lowering unchanged
 * (the recorded `BypassParamsField.type` in group (f) is the evidence).
 */
function paramSrc(rhs: string, body: string = BODY): string {
  return `---\nmode: prompt\nparams:\n  p: ${JSON.stringify(rhs)}\n---\n${body}`;
}

/** A theta whose body declares `schema X = <rhs>` and whose `params:` refers to it. */
function aliasSrc(rhs: string): string {
  return `---\nmode: prompt\nparams:\n  s: X\n---\n${TRIAGE_BODY}schema X = ${rhs}\nlet x = 1\n`;
}

/** A theta whose body declares `schema S { f: <rhs> }` and whose `params:` refers to it. */
function fieldSrc(rhs: string): string {
  return `---\nmode: prompt\nparams:\n  s: S\n---\n${TRIAGE_BODY}schema S { f: ${rhs} }\nlet x = 1\n`;
}

/** A theta whose body carries a typed query annotated `@<rhs>`. */
function annotationSrc(rhs: string): string {
  return `---\nmode: prompt\n---\n${TRIAGE_BODY}let r = @<${rhs}>\`x\`\nr\n`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * The `schema` declarations of a body that must load cleanly — the input
 * `lowerQueryResponseSchema` takes, built the way the shipped producer builds
 * it (from `doc.body.statements`; the document's own `schemas` property is
 * absent for an alias-form declaration and would silently yield an empty set).
 * A body that fails to load throws with its diagnostics rendered, so a broken
 * fixture never reads as a lowering result.
 */
function schemaDeclsOf(body: string): readonly SchemaDecl[] {
  const doc = parseDoc(`---\nmode: prompt\n---\n${body}`, "bug0097.theta");
  if (doc.diagnostics.length > 0) {
    throw new Error(
      `harness: the decl body must load cleanly, but produced ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The declaration set an inline annotation resolves against. */
const TRIAGE_DECLS = schemaDeclsOf(BODY);

/**
 * The lowered response schema for an annotation, or a loud failure.
 * `undefined` is reserved for the EMPTY annotation alone, so it is a harness
 * error here rather than a fixture outcome.
 */
function loweredAnnotation(label: string, annotation: string): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, TRIAGE_DECLS);
  if (lowered === undefined) {
    throw new Error(
      `${label}: \`@<${annotation}>\` lowered to nothing, so there is no reference document to compare the \`params:\` position against`,
    );
  }
  return lowered;
}

/** A parsed, cleanly-lowered `params:` block. */
interface LoadedParams {
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly defs: Record<string, unknown>;
  readonly fields: readonly BypassParamsField[];
  readonly loweredSchema: LoweredSchema;
}

/**
 * Parse a fixture that must LOAD, and read its lowered `params:` schema back.
 * Every absent intermediate — a `null` frontmatter, an absent `params`, an
 * absent `loweredSchema`, an absent `properties` — THROWS with the diagnostics
 * rendered. A refused parse must never read as a pass.
 */
function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0097.theta");
  expect(
    diagLines(doc),
    `${label}: this declaration is legal theta (grammar.md:94/:101/:105), so the fixture must load with NO diagnostics; observed ${JSON.stringify(diagLines(doc))}`,
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
    required: (lowered["required"] ?? []) as readonly string[],
    defs: (lowered["$defs"] ?? {}) as Record<string, unknown>,
    fields: params.fields,
    loweredSchema: lowered,
  };
}

/**
 * The refusal contract for the `params:` position: EXACTLY the given rendered
 * diagnostic lines, in order, and the theta does not load (`frontmatter ===
 * null`, because `parseParams` withholds the lowered schema on any error and
 * `parseFrontmatter` then refuses the block).
 */
function expectParamsRefused(
  label: string,
  source: string,
  expected: readonly string[],
  why: string,
): void {
  const doc = parseDoc(source, "bug0097.theta");
  expect(
    diagLines(doc),
    `${label}: ${why}; observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([...expected]);
  expect(
    doc.frontmatter,
    `${label}: an error-severity \`params:\` diagnostic collapses the frontmatter, which is the registry rows' "the theta is not registered" posture; a loaded theta whose param validates a shape nobody declared is the hole this report names`,
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
 * Every `$ref` in a document resolves against the DOCUMENT ROOT's `$defs`. An
 * arm hoisted without the matching closure leaves a dangling pointer AJV
 * refuses with `MissingRefError`; this check names the missing entry before the
 * compile does.
 */
function expectRefsClosed(label: string, document: Record<string, unknown>): void {
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  const missing = [...new Set(refNames(document))].filter((name) => !(name in defs));
  expect(
    missing,
    `${label}: every \`#/$defs/<name>\` pointer must have a fragment at the document root, or AJV refuses the whole document with MissingRefError; document=${JSON.stringify(document)}`,
  ).toEqual([]);
}

/** A lowered document split into its root form and its `$defs` table. */
function splitDefs(document: Record<string, unknown>): {
  readonly root: Record<string, unknown>;
  readonly defs: Record<string, unknown>;
} {
  const { $defs, ...root } = document;
  return { root, defs: ($defs ?? {}) as Record<string, unknown> };
}

// ===========================================================================
// (0) THE ORACLE ITSELF — GREEN now and after. `schemaSlug` is not imported, so
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

describe("bug 0097 (0) — the independent slug oracle", () => {
  const cases: ReadonlyArray<readonly [string, string, unknown]> = [
    ["`{a: integer}`", A_INT_CANONICAL, A_INT_FRAGMENT],
    ["`{b: integer}`", B_INT_CANONICAL, B_INT_FRAGMENT],
    ["`{c: integer}`", C_INT_CANONICAL, C_INT_FRAGMENT],
    ["ARRAY-NESTING `{m: {a: integer} | {b: integer}}`", M_UNION_CANONICAL, M_UNION_FRAGMENT],
    ["`{p: integer, q: boolean}`", PQ_CANONICAL, PQ_FRAGMENT],
    ["`{x: {p: integer, q: boolean}}`", X_PQ_CANONICAL, X_PQ_FRAGMENT],
    ["`{y: string}`", Y_STR_CANONICAL, Y_STR_FRAGMENT],
    ["CONTROL `{a: integer, b: string}`", AB_CANONICAL, AB_FRAGMENT],
    ["CONTROL nested `{x: integer, y: string}`", XY_CANONICAL, XY_FRAGMENT],
    [
      "CONTROL outer `{a: integer, b: {x: integer, y: string}}`",
      A_XY_CANONICAL,
      A_XY_FRAGMENT,
    ],
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
      `every distinct fragment must produce a distinct slug, or the arm-identity claims below would be vacuous; observed ${JSON.stringify(slugs)}`,
    ).toBe(cases.length);
  });

  it("ORACLE CROSS-CHECK: the recipe reproduces slugs production mints TODAY at positions this fix does not move", () => {
    // Taken from production output rather than from `schemaSlug` directly, and
    // taken only at positions outside constraint 1's moved class — the
    // annotation root's own arm mints and the `params:` position's
    // single-enclosing-group mints — so the cross-check is a fixed point of
    // the fix rather than a restatement of what the fix changes.
    const armMints = splitDefs(loweredAnnotation("CROSS-CHECK arms", "{a: integer} | {b: integer}"));
    expect(
      Object.keys(armMints.defs).sort(),
      `the annotation root hoists each arm under the name the oracle derives; observed ${JSON.stringify(armMints.defs)}`,
    ).toEqual([A_INT_INLINE, B_INT_INLINE].sort());

    const singleGroup = loadCleanly("CROSS-CHECK single group", paramSrc("{a: integer, b: string}"));
    expect(
      Object.keys(singleGroup.defs),
      `the \`params:\` position's mint for a genuine single enclosing brace group; observed ${JSON.stringify(singleGroup.defs)}`,
    ).toEqual([AB_INLINE]);

    const nested = loadCleanly(
      "CROSS-CHECK nested single group",
      paramSrc("{a: integer, b: {x: integer, y: string}}"),
    );
    expect(
      Object.keys(nested.defs).sort(),
      `a nested hoist makes the OUTER slug a function of the INNER one, so a wrong recipe cannot survive both; observed ${JSON.stringify(Object.keys(nested.defs))}`,
    ).toEqual([XY_INLINE, A_XY_INLINE].sort());
  });
});

// ===========================================================================
// (a) THE INVARIANCE CONTROLS — every shape bug 0097 §Fix constraint 1 leaves
// byte-unchanged, minted slugs included, plus the two diagnostic postures the
// fix must not disturb. GREEN at HEAD and green after. Asserted first so a red
// below names the defect rather than a broken control.
// ===========================================================================

describe("bug 0097 (a) — the `params:` shapes the dispatch keeps byte-for-byte", () => {
  it("CONTROL (a1): `p: \"{a: integer, b: string}\"` keeps its hoist and its minted name", () => {
    // §Fix constraint 3: a source that IS one enclosing brace group keeps
    // today's route — `hoistInlineObjectType` over the whole source, this
    // function as the per-field recursion — so its bytes and its slug hold.
    const loaded = loadCleanly("a1", paramSrc("{a: integer, b: string}"));
    expect(
      loaded.loweredSchema,
      `bug 0097 §Affected "Not affected": a \`params:\` type that IS a single enclosing brace group; observed ${JSON.stringify(loaded.loweredSchema)}`,
    ).toEqual({
      type: "object",
      properties: { p: { $ref: `#/$defs/${AB_INLINE}` } },
      required: ["p"],
      additionalProperties: false,
      $defs: { [AB_INLINE]: AB_FRAGMENT },
    });
    expectRefsClosed("a1", loaded.loweredSchema);
  });

  it("CONTROL (a2): a single group carrying a NESTED object keeps both minted names", () => {
    const loaded = loadCleanly("a2", paramSrc("{a: integer, b: {x: integer, y: string}}"));
    expect(
      loaded.loweredSchema,
      `§Fix constraint 3 — \`__inline_dd69af402813aa7d\` over \`__inline_c319be1cd4ab5f98\`, the two names this position mints today; observed ${JSON.stringify(loaded.loweredSchema)}`,
    ).toEqual({
      type: "object",
      properties: { p: { $ref: `#/$defs/${A_XY_INLINE}` } },
      required: ["p"],
      additionalProperties: false,
      $defs: { [XY_INLINE]: XY_FRAGMENT, [A_XY_INLINE]: A_XY_FRAGMENT },
    });
    expectRefsClosed("a2", loaded.loweredSchema);
  });

  it("CONTROL (a3): a plain named type keeps its `$ref` and its hoisted declaration", () => {
    const loaded = loadCleanly("a3", paramSrc("Triage"));
    expect(loaded.properties["p"], "schema-subset.md:76 — a named schema reference").toEqual({
      $ref: "#/$defs/Triage",
    });
    expect(loaded.defs["Triage"], "the named schema's closed lowering").toEqual(TRIAGE_DEF);
    expect(Object.keys(loaded.defs), "only the referenced name is hoisted").toEqual(["Triage"]);
  });

  it("CONTROL (a4): the SHREDDED segment set keeps its per-segment permissive `anyOf` and its silence", () => {
    // `{ a: string | null } | Triage` splits into `{ a: string`, `null }`,
    // `Triage`, and the first two are not brace-balanced, so `isBraceBalanced`
    // (src/parser/body-type-lowering.ts:279) refuses the arm path at every
    // position alike. §Non-goals leaves this to bug 0033 §Fix residual (ii);
    // §Fix constraint 4 keeps a shape the lowering cannot derive permissive.
    const loaded = loadCleanly("a4", paramSrc("{ a: string | null } | Triage"));
    expect(
      loaded.properties["p"],
      `bug 0097 §Non-goals: a shredded segment set stays per-segment permissive; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual({ anyOf: [{}, {}, { $ref: "#/$defs/Triage" }] });
    expect(
      Object.keys(loaded.defs),
      "only the resolvable named arm is hoisted; no `__inline_` fragment is minted for a shard",
    ).toEqual(["Triage"]);
  });

  it("CONTROL (a5): `array<integer>` keeps its generic emission", () => {
    const loaded = loadCleanly("a5", paramSrc("array<integer>"));
    expect(loaded.properties["p"], "schema-subset.md step 3 — the `array<T>` emission").toEqual({
      type: "array",
      items: { type: "integer" },
    });
    expect(Object.keys(loaded.defs), "nothing is hoisted").toEqual([]);
  });

  it("CONTROL (a6): a union with NO brace arm keeps SUBS-1's primitive form", () => {
    // schema-subset.md:81 — a union all of whose arms are primitive lowers to
    // the multi-type-array form, never to `anyOf`. Nothing here reaches the
    // brace dispatch at all, which is what makes it the bound on the fix.
    const loaded = loadCleanly("a6", paramSrc("string | integer"));
    expect(
      loaded.properties["p"],
      `SUBS-1's primitive-union form; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual({ type: ["string", "integer"] });
  });

  it("CONTROL (a7): a string-literal union keeps its enum emission", () => {
    // schema-subset.md:80. §Non-goals leaves the literal sublanguage to bug
    // 0056; a literal union carries no brace arm and never enters the arm path.
    const loaded = loadCleanly("a7", paramSrc('"x" | "y"'));
    expect(
      loaded.properties["p"],
      `schema-subset.md:80 — the string-literal union form; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual({ type: "string", enum: ["x", "y"] });
  });

  it("CONTROL (a8): the empty inline object `p: \"{}\"` keeps its parse refusal", () => {
    // grammar.md:109 refuses `{}` in any `Type` position at any depth.
    // `isSingleEnclosingBraceGroup("{}")` is true, so §Non-goals records that
    // the fix does not reach this shape.
    expectParamsRefused(
      "a8",
      paramSrc("{}"),
      [emptySchemaBodyLine("{}")],
      "grammar.md:109 — an empty inline object type is refused at every `Type` position, and the corrected dispatch answers this source exactly as the naive one does",
    );
  });

  it("CONTROL (a9): `p: \"{a: ???}\"` keeps its single `params-type-not-expression`", () => {
    // The brace-frame exemption in frontmatter-fields-a.md:58 is the
    // FRAGMENT's own, not its enclosure's: the enclosing `{a: ???}` carries a
    // brace and is admitted, and the field type `???` reached THROUGH the
    // hoist is brace-free and refused. Group (e4) pins the union spelling
    // converging on this same code.
    expectParamsRefused(
      "a9",
      paramSrc("{a: ???}"),
      [paramsNotExpressionLine("p")],
      "code-registry-load.md:19 — a brace-free fragment reached through a hoisted inline object's field type is refused like any other",
    );
  });

  it("CONTROL (a10): TWO names in ONE brace group render TWO `params:` diagnostics, where the alias RHS renders one", () => {
    // The per-occurrence posture at this position, pinned so group (e3)'s
    // two-diagnostic expectation is shown to be the position's existing
    // contract rather than something the fix introduces. `parseParams`'s loop
    // (`src/parser/params.ts`) emits one diagnostic per entry in
    // `lowerCtx.unresolved`, and the hoist appends one per field it lowers;
    // the body positions read a de-duplicated name walk instead.
    expectParamsRefused(
      "a10 — `params:`",
      paramSrc("{a: Ghost, b: Ghost}"),
      [unresolvedLine("Ghost"), unresolvedLine("Ghost")],
      "the `params:` position reports one diagnostic per unresolved OCCURRENCE",
    );
    const alias = parseDoc(aliasSrc("{a: Ghost, b: Ghost}"), "bug0097.theta");
    expect(
      diagLines(alias),
      `a10 — the alias RHS reports the unresolved NAME once for the same text; observed ${JSON.stringify(diagLines(alias))}`,
    ).toEqual([unresolvedLine("Ghost")]);
  });

  it("CONTROL (a11): a default beside a union-typed param stays admitted and recorded", () => {
    // The default half is `splitParamValue`'s (src/parser/frontmatter.ts:777)
    // and is judged by `parseParams`'s literal-sublanguage checks
    // (`src/parser/params.ts`), which read the default text and the
    // declared type's compatibility — neither of which the brace dispatch
    // touches. Group (e2) pins the same shape once the TYPE half refuses.
    const loaded = loadCleanly("a11", paramSrc("{a: integer} | {b: integer} = 7"));
    const field = fieldOf(loaded, "p");
    expect(field.hasDefault, "the `= 7` half is recognised as a default").toBe(true);
    expect(field.defaultSource, "the default RHS is recorded verbatim").toBe("7");
    expect(
      loaded.required,
      "a defaulted field is not `required` in the lowered document",
    ).toEqual([]);
  });
});

// ===========================================================================
// (b) ELEMENT 1 — the FOUR-POSITION PARITY table. grammar.md:105 and
// type-system.md:15 promise one grammar in every type-annotation position, and
// schema-subset.md:98 makes the minted name a function of the lowered fragment,
// so one source text yields one document and one set of names at every
// position. The `schema` body field position carries no row here (§Non-goals).
// RED at HEAD: the `params:` position mints one single-field mis-parse.
// ===========================================================================

describe("bug 0097 (b) — a top-level union of object arms on the `params:` RHS lowers `anyOf` over hoisted arms", () => {
  it("RED (b1): `p: \"{a: integer} | {b: integer}\"` hoists BOTH arms and refs them in source order", () => {
    // The defect in one line: `lowerParamsFieldType`'s dispatch
    // (`src/parser/params.ts`) tests the first and last CHARACTERS — the
    // inline `s.startsWith("{") && s.endsWith("}")` — so the first arm's `{`
    // and the last arm's `}` are read as one group and
    // `a: integer} | {b: integer` is handed to `hoistInlineObjectType` as a
    // field list — minting a fragment that REQUIRES `a`, constrains it to
    // nothing, and refuses `b`.
    const loaded = loadCleanly("b1", paramSrc("{a: integer} | {b: integer}"));
    expect(
      loaded.loweredSchema,
      `schema-subset.md:81 (SUBS-1) — a union with a non-primitive arm lowers to \`anyOf\`, arms in source order; :73/:76 hoist each object arm under \`__inline_<slug>\`; observed ${JSON.stringify(loaded.loweredSchema)}`,
    ).toEqual(UNION_PARAMS_DOCUMENT);
    expect(
      Object.keys(loaded.defs).sort(),
      `exactly the two arm fragments — a single \`__inline_\` entry here is the one-field-list mis-parse; observed ${JSON.stringify(Object.keys(loaded.defs))}`,
    ).toEqual([A_INT_INLINE, B_INT_INLINE].sort());
    expectRefsClosed("b1", loaded.loweredSchema);
  });

  it("RED (b2): the `params:` document's arm fragments are BYTE-EQUAL to the `@<T>` annotation root's, under IDENTICAL names", () => {
    // The decisive parity cell. The annotation root already produces the
    // SUBS-1 document for this text (asserted first, so a red here names a
    // broken reference rather than the defect), and schema-subset.md:98 makes
    // the minted name a function of the lowered fragment — so two positions
    // that lower one source text mint one name.
    const annotation = splitDefs(loweredAnnotation("b2 reference", "{a: integer} | {b: integer}"));
    expect(
      annotation.root,
      `REFERENCE: the \`@<T>\` root's SUBS-1 document for this text; observed ${JSON.stringify(annotation.root)}`,
    ).toEqual(UNION_ROOT);
    expect(
      annotation.defs,
      `REFERENCE: the \`@<T>\` root's two hoisted arm fragments; observed ${JSON.stringify(annotation.defs)}`,
    ).toEqual(UNION_DEFS);

    const loaded = loadCleanly("b2", paramSrc("{a: integer} | {b: integer}"));
    expect(
      loaded.properties["p"],
      `type-system.md:15 — one type grammar in every annotation position, so the \`params:\` field's lowering must be the annotation root's; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual(annotation.root);
    expect(
      loaded.defs,
      `schema-subset.md:98 — the slug is a function of the LOWERED fragment, so the \`params:\` document's \`$defs\` must carry the annotation root's arm fragments under the annotation root's names; observed ${JSON.stringify(loaded.defs)}`,
    ).toEqual(annotation.defs);
  });

  it("RED (b3): the `schema X = …` alias RHS agrees with the `params:` document on both arm fragments", () => {
    // The third position of the parity table, driven through the load path so
    // the alias's own hoist is the one under comparison. The alias nests its
    // union under `$defs.X` and closes the arms at the document root, so the
    // shared claim is the ARM fragments and their names.
    const alias = loadCleanly("b3 reference", aliasSrc("{a: integer} | {b: integer}"));
    expect(
      alias.defs["X"],
      `REFERENCE: the alias RHS's SUBS-1 union over the two hoisted arms; observed ${JSON.stringify(alias.defs["X"])}`,
    ).toEqual(UNION_ROOT);

    const loaded = loadCleanly("b3", paramSrc("{a: integer} | {b: integer}"));
    for (const name of [A_INT_INLINE, B_INT_INLINE]) {
      expect(
        loaded.defs[name],
        `grammar.md:105 — "the grammar is otherwise identical in every position", so \`${name}\` must carry the same bytes the alias RHS hoists it under; alias=${JSON.stringify(alias.defs[name])} params=${JSON.stringify(loaded.defs[name])} and the \`params:\` document's whole \`$defs\` table is ${JSON.stringify(loaded.defs)}`,
      ).toEqual(alias.defs[name]);
    }
  });

  it("RED (b4): leading space, trailing space and no space around `|` all reach the same document", () => {
    // The dispatch reads the trimmed source's endpoints, so spacing cannot be
    // what decides a lowering; pinning the three spellings together keeps a
    // fix from closing one of them.
    for (const [label, rhs] of [
      ["b4a — a leading space", " {a: integer} | {b: integer}"],
      ["b4b — a trailing space", "{a: integer} | {b: integer} "],
      ["b4c — no space around the `|`", "{a: integer}|{b: integer}"],
    ] as const) {
      const loaded = loadCleanly(label, paramSrc(rhs));
      expect(
        loaded.loweredSchema,
        `${label}: grammar.md:94 does not read whitespace, so this spelling lowers exactly as b1 does; observed ${JSON.stringify(loaded.loweredSchema)}`,
      ).toEqual(UNION_PARAMS_DOCUMENT);
    }
  });

  it("RED (b5): a THIRD object arm hoists too — arm count is not the axis", () => {
    const loaded = loadCleanly("b5", paramSrc("{a: integer} | {b: integer} | {c: integer}"));
    expect(
      loaded.properties["p"],
      `schema-subset.md:81/:85 — every arm of the union, in source order; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual({
      anyOf: [
        { $ref: `#/$defs/${A_INT_INLINE}` },
        { $ref: `#/$defs/${B_INT_INLINE}` },
        { $ref: `#/$defs/${C_INT_INLINE}` },
      ],
    });
    expect(
      loaded.defs,
      `three arms, three hoisted fragments; observed ${JSON.stringify(loaded.defs)}`,
    ).toEqual({
      [A_INT_INLINE]: A_INT_FRAGMENT,
      [B_INT_INLINE]: B_INT_FRAGMENT,
      [C_INT_INLINE]: C_INT_FRAGMENT,
    });
    expectRefsClosed("b5", loaded.loweredSchema);
  });

  it("RED (b6): an arm carrying a NESTED object hoists transitively and mints no phantom field", () => {
    // One nesting level deeper than b1. grammar.md:109 makes an inline
    // object's field `Type` recursive and schema-subset.md:73 hoists an inline
    // object in ANY type position, so the first arm's own nested object gets
    // its own entry and the document carries THREE fragments.
    const loaded = loadCleanly("b6", paramSrc("{x: {p: integer, q: boolean}} | {y: string}"));
    expect(
      loaded.properties["p"],
      `two arms, each a \`$ref\` at its use (:76); observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual({
      anyOf: [{ $ref: `#/$defs/${X_PQ_INLINE}` }, { $ref: `#/$defs/${Y_STR_INLINE}` }],
    });
    expect(
      loaded.defs,
      `three fragments close this document: each arm and the first arm's nested object; observed ${JSON.stringify(loaded.defs)}`,
    ).toEqual({
      [PQ_INLINE]: PQ_FRAGMENT,
      [X_PQ_INLINE]: X_PQ_FRAGMENT,
      [Y_STR_INLINE]: Y_STR_FRAGMENT,
    });
    expectRefsClosed("b6", loaded.loweredSchema);
  });

  it("RED (b7): a union that is NOT brace-suffixed still hoists its brace arm", () => {
    // §Fix constraint 1, table row 2. `integer | {b: integer}` never satisfies
    // the naive test — its last character is `}` but its first is `i` — so it
    // lowers per-segment today and the brace arm reaches `lowerTypeExpr`'s
    // (`src/parser/params.ts`) catch-all, which has no inline-object arm at
    // any depth. The arm dispatch
    // (src/parser/body-type-lowering.ts:446–:459) is what descends into it.
    const loaded = loadCleanly("b7", paramSrc("integer | {b: integer}"));
    expect(
      loaded.properties["p"],
      `SUBS-1 :81 with a primitive first arm and a hoisted object second arm; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual({ anyOf: [{ type: "integer" }, { $ref: `#/$defs/${B_INT_INLINE}` }] });
    expect(
      loaded.defs,
      `the brace arm's fragment, under the name every other position mints for \`{b: integer}\`; observed ${JSON.stringify(loaded.defs)}`,
    ).toEqual({ [B_INT_INLINE]: B_INT_FRAGMENT });
    expectRefsClosed("b7", loaded.loweredSchema);
  });

  it("RED (b8): a brace arm beside a NAMED arm hoists the brace arm and keeps the named `$ref`", () => {
    const loaded = loadCleanly("b8", paramSrc("{a: integer} | Triage"));
    expect(
      loaded.properties["p"],
      `SUBS-1's mixed reference vector (:81): the object arm hoists, the named arm refs; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual({ anyOf: [{ $ref: `#/$defs/${A_INT_INLINE}` }, { $ref: "#/$defs/Triage" }] });
    expect(
      loaded.defs,
      `both referents closed at the document root; observed ${JSON.stringify(loaded.defs)}`,
    ).toEqual({ [A_INT_INLINE]: A_INT_FRAGMENT, Triage: TRIAGE_DEF });
    expectRefsClosed("b8", loaded.loweredSchema);
  });

  it("RED (b9): appending a primitive arm keeps BOTH object arms hoisted", () => {
    const loaded = loadCleanly("b9", paramSrc("{a: integer} | {b: integer} | integer"));
    expect(
      loaded.properties["p"],
      `arms in source order (:85), the two object arms hoisted and the primitive arm inline; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual({
      anyOf: [
        { $ref: `#/$defs/${A_INT_INLINE}` },
        { $ref: `#/$defs/${B_INT_INLINE}` },
        { type: "integer" },
      ],
    });
    expect(loaded.defs, "both object arms' fragments").toEqual(UNION_DEFS);
    expectRefsClosed("b9", loaded.loweredSchema);
  });

  it("RED (b10): a brace-suffixed SHREDDED set moves from WRONG to PERMISSIVE, landing on the annotation root's bytes", () => {
    // §Fix constraint 4 and bug 0039 §Fix constraint 1: "a shape the lowering
    // cannot derive stays permissive `{}` … permissive is admissible, wrong is
    // not". `{ a: string | null } | {b: integer}` shreds into `{ a: string`,
    // `null }`, `{b: integer}`, so `isBraceBalanced`
    // (src/parser/body-type-lowering.ts:279) refuses the arm path — but the
    // source is still brace-suffixed, so today it takes the naive hoist and
    // mints a fragment for a shape nobody wrote. The reference is what the
    // annotation root already emits for the identical text.
    const reference = loweredAnnotation("b10 reference", "{ a: string | null } | {b: integer}");
    expect(
      reference,
      `REFERENCE: the annotation root's per-segment permissive emission for a shredded set; observed ${JSON.stringify(reference)}`,
    ).toEqual({ anyOf: [{}, {}, {}] });

    const loaded = loadCleanly("b10", paramSrc("{ a: string | null } | {b: integer}"));
    expect(
      loaded.properties["p"],
      `the shredded set must reach the SAME permissive emission at this position; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual(reference);
    expect(
      Object.keys(loaded.defs),
      `nothing is hoisted from a shredded set — an \`__inline_\` entry here is a fragment for a shape the source does not declare; observed ${JSON.stringify(Object.keys(loaded.defs))}`,
    ).toEqual([]);
  });

  it("RED (b11): a MALFORMED brace-suffixed source moves from WRONG to PERMISSIVE too", () => {
    // `{a: integer} | integer}` is not a union at all — its trailing `}`
    // closes nothing — and the naive test fires on that character alone,
    // minting `{"a":{"anyOf":[{},{"type":"integer"}]}}`. Every segment must be
    // brace-balanced for the arm path, and the second is not.
    const reference = loweredAnnotation("b11 reference", "{a: integer} | integer}");
    expect(
      reference,
      `REFERENCE: the annotation root's per-segment permissive emission for the malformed source; observed ${JSON.stringify(reference)}`,
    ).toEqual({ anyOf: [{}, {}] });

    const loaded = loadCleanly("b11", paramSrc("{a: integer} | integer}"));
    expect(
      loaded.properties["p"],
      `a positional test firing on the last character is what mints a fragment here; the structural question declines and the source lowers per segment; observed ${JSON.stringify(loaded.properties["p"])}`,
    ).toEqual(reference);
    expect(
      Object.keys(loaded.defs),
      `nothing is hoisted; observed ${JSON.stringify(Object.keys(loaded.defs))}`,
    ).toEqual([]);
  });

  it("RED (b12): a moved-class union NESTED as a single group's field type mints the enclosing group onto the shared name", () => {
    // The nested-depth member of §Fix constraint 1's class, and the one cell
    // where the moved bytes are an ENCLOSING group's rather than the union's
    // own. `{m: {a: integer} | {b: integer}}` IS a single enclosing brace
    // group, so it keeps the unmoved hoist route (§Fix constraint 3) — but the
    // field `m` recurses back into `lowerParamsFieldType`, which is where the
    // arm dispatch lives, so the hoisted fragment carries the two arm `$ref`s
    // and schema-subset.md:98 hashes THAT. The enclosing slug therefore lands
    // on the name the sibling positions mint for the same text, which is the
    // one-source-text-one-name rule §Fix constraint 3 states.
    const loaded = loadCleanly("b12", paramSrc("{m: {a: integer} | {b: integer}}"));
    expect(
      loaded.loweredSchema,
      `grammar.md:109 makes an inline object's field \`Type\` recursive, so the field's union is the same two-arm union b1 drives; observed ${JSON.stringify(loaded.loweredSchema)}`,
    ).toEqual({
      type: "object",
      properties: { p: { $ref: `#/$defs/${M_UNION_INLINE}` } },
      required: ["p"],
      additionalProperties: false,
      $defs: {
        [A_INT_INLINE]: A_INT_FRAGMENT,
        [B_INT_INLINE]: B_INT_FRAGMENT,
        [M_UNION_INLINE]: M_UNION_FRAGMENT,
      },
    });
    expectRefsClosed("b12", loaded.loweredSchema);

    // The cross-position agreement, COMPUTED rather than copied: the alias
    // right-hand side and the `schema` body field type lower the identical
    // text through `lowerTypeSource`, so schema-subset.md:98 forces one name.
    // Reading their mints out of production is what makes this a parity claim
    // instead of a restatement of the hand-written slug above.
    const alias = loadCleanly("b12 alias reference", aliasSrc("{m: {a: integer} | {b: integer}}"));
    const field = loadCleanly("b12 field reference", fieldSrc("{m: {a: integer} | {b: integer}}"));
    for (const [label, reference] of [
      ["the `schema X = …` alias RHS", alias],
      ["the `schema S { f: … }` body field type", field],
    ] as const) {
      expect(
        reference.defs[M_UNION_INLINE],
        `${label} must hoist this text under the same name and the same bytes the \`params:\` position does; observed ${JSON.stringify(reference.defs)}`,
      ).toEqual(M_UNION_FRAGMENT);
      expect(
        loaded.defs[M_UNION_INLINE],
        `type-system.md:15 — one grammar, one lowering, one mint; ${label} carries ${JSON.stringify(reference.defs[M_UNION_INLINE])} and the \`params:\` position carries ${JSON.stringify(loaded.defs[M_UNION_INLINE])}`,
      ).toEqual(reference.defs[M_UNION_INLINE]);
    }
  });
});

// ===========================================================================
// (c) THE ARGUMENT BOUNDARY — frontmatter-fields-a.md:57, "`params` are
// validated with AJV at invocation time". Driven through the real production
// `AjvSchemaValidator` over the document the load produced, which is the
// document all three consumers compile
// (src/extension/production-theta-producer.ts:767 the binder envelope build,
// :1253 the post-default-merge compile, :2061 the subagent child's params
// intake).
// RED at HEAD in exactly four cells, called out by name below.
// ===========================================================================

describe("bug 0097 (c) — the lowered `params:` document admits exactly the declared arms", () => {
  it("RED (c1): the real AJV accept/reject table over `p: \"{a: integer} | {b: integer}\"`", () => {
    const loaded = loadCleanly("c1", paramSrc("{a: integer} | {b: integer}"));
    const { validator, emitted } = ajv();
    const compiled = validator.compile(loaded.loweredSchema);
    for (const [label, payload, ok] of [
      ["the FIRST arm's shape", { p: { a: 1 } }, true],
      [
        "INVERTING CELL 1 — the SECOND arm's shape, which the author declared and the mis-parse refuses",
        { p: { b: 1 } },
        true,
      ],
      [
        "INVERTING CELL 2 — `null` where the first arm declares an integer, matching NEITHER arm",
        { p: { a: null } },
        false,
      ],
      [
        "INVERTING CELL 3 — a string where the first arm declares an integer, matching NEITHER arm",
        { p: { a: "not an integer" } },
        false,
      ],
      [
        "INVERTING CELL 4 — an object where the first arm declares an integer, matching NEITHER arm",
        { p: { a: { deep: true } } },
        false,
      ],
      ["both arms' fields at once", { p: { a: 1, b: 1 } }, false],
      ["neither arm's field", { p: { c: 3 } }, false],
      ["a non-object argument", { p: 7 }, false],
    ] as const) {
      const result = compiled.validate(payload);
      expect(
        result.ok,
        `${label}: frontmatter-fields-a.md:57/:58 — the compiled document is the argument contract, and a two-arm union of object types admits exactly its arms; payload=${JSON.stringify(payload)} observed ${JSON.stringify(result)}`,
      ).toBe(ok);
    }
    expect(
      emitted.map((d) => d.code),
      `the lowered document must compile without a validator diagnostic; observed ${JSON.stringify(emitted)}`,
    ).toEqual([]);
  });

  it("RED (c2): the inline spelling accepts exactly what the NAMED spelling of the same union accepts", () => {
    // type-system.md:15 as an executable claim at the argument boundary: an
    // author moving `{a: integer} | {b: integer}` between `params: p: X` with
    // `schema X = …` and the inline `params:` spelling gets one contract. The
    // named spelling is asserted first, so a red here names the inline route.
    const named = loadCleanly("c2 reference", aliasSrc("{a: integer} | {b: integer}"));
    const namedCompiled = ajv().validator.compile(named.loweredSchema);
    const inline = loadCleanly("c2", paramSrc("{a: integer} | {b: integer}"));
    const inlineCompiled = ajv().validator.compile(inline.loweredSchema);
    for (const [wireName, payload] of [
      ["s", { s: { a: 1 } }],
      ["s", { s: { b: 1 } }],
      ["s", { s: { a: null } }],
      ["s", { s: { c: 3 } }],
      ["s", { s: 7 }],
    ] as const) {
      const expected = namedCompiled.validate(payload).ok;
      const inlinePayload = { p: (payload as Record<string, unknown>)[wireName] };
      expect(
        inlineCompiled.validate(inlinePayload).ok,
        `type-system.md:15 — the named and inline spellings of one type expression must produce one accept/reject table; named ${JSON.stringify(payload)} -> ${expected}, inline ${JSON.stringify(inlinePayload)} -> ${inlineCompiled.validate(inlinePayload).ok}`,
      ).toBe(expected);
    }
  });
});

// ===========================================================================
// (d) ELEMENT 2 — the four-position diagnostic table.
// code-registry-parse.md:94 names the `params:` right-hand side FIRST among the
// row's five positions, at error severity, with the theta not registered.
// RED at HEAD: the three `params:` rows load with zero diagnostics.
// ===========================================================================

describe("bug 0097 (d) — a name inside a union ARM raises unresolved-named-type at the `params:` position", () => {
  const UNION_SOURCES = [
    "{a: Ghost} | {b: integer}",
    "{a: Ghost} | Triage",
    "integer | {b: Ghost}",
  ] as const;

  it("CONTROL (d0): the three sibling positions already raise for all three sources", () => {
    // Asserted FIRST so a red below names the defect rather than a broken
    // control. The `schema` body field position's present disposition for
    // these sources is bug 0095 §Fix's: the union's field list survives the
    // parse capture, so the position reports the unresolved name rather than
    // `theta/parse/empty-schema-body`.
    for (const rhs of UNION_SOURCES) {
      for (const [label, source] of [
        ["the `@<T>` annotation", annotationSrc(rhs)],
        ["the `schema X = …` alias RHS", aliasSrc(rhs)],
        ["the `schema` body field type", fieldSrc(rhs)],
      ] as const) {
        const doc = parseDoc(source, "bug0097.theta");
        expect(
          diagLines(doc),
          `CONTROL ${label} over \`${rhs}\`: code-registry-parse.md:94 lists this position at error severity; observed ${JSON.stringify(diagLines(doc))}`,
        ).toEqual([unresolvedLine("Ghost")]);
      }
    }
  });

  it("CONTROL (d1): the single-group spelling already raises at `params:`", () => {
    // The bound on the silence: this position raises the row's code whenever
    // its lowering descends at all, so what is missing is the descent, not the
    // channel.
    expectParamsRefused(
      "d1",
      paramSrc("{a: Ghost}"),
      [unresolvedLine("Ghost")],
      "code-registry-parse.md:94 position 1 — the `params:` right-hand side",
    );
  });

  it("RED (d2): `p: \"{a: Ghost} | {b: integer}\"` raises exactly one unresolved-named-type", () => {
    // The name sits inside the mis-parsed field's shredded type text
    // (`Ghost} | {b: integer`), so it never matches `lowerTypeExpr`'s
    // identifier arm, never lands in `lowerCtx.unresolved`, and
    // `parseParams`'s loop (`src/parser/params.ts`) has nothing to report.
    expectParamsRefused(
      "d2",
      paramSrc("{a: Ghost} | {b: integer}"),
      [unresolvedLine("Ghost")],
      "code-registry-parse.md:94 — byte-identical to what the `@<T>`, alias and body-field positions render for this same text (CONTROL d0)",
    );
  });

  it("RED (d3): `p: \"{a: Ghost} | Triage\"` raises exactly one unresolved-named-type", () => {
    expectParamsRefused(
      "d3",
      paramSrc("{a: Ghost} | Triage"),
      [unresolvedLine("Ghost")],
      "code-registry-parse.md:94 — the resolvable named arm must not mask the unresolvable name inside the object arm",
    );
  });

  it("RED (d4): `p: \"integer | {b: Ghost}\"` raises exactly one unresolved-named-type", () => {
    // The silence is wider than the mis-parse: this source is not
    // brace-suffixed, so it lowers per-segment rather than wrongly — and the
    // brace arm still reaches a catch-all instead of a hoist that would
    // descend into it.
    expectParamsRefused(
      "d4",
      paramSrc("integer | {b: Ghost}"),
      [unresolvedLine("Ghost")],
      "code-registry-parse.md:94 — a brace arm that lowers permissively still owes the name inside it",
    );
  });
});

// ===========================================================================
// (e) THE BUG-0059 INTERPLAY — `parseParams`'s per-field one-diagnostic
// precedence (`src/parser/params.ts`, the guard extension in the same loop)
// meeting a position that begins descending into union arms. Every cell here
// is about MULTIPLICITY and CODE, not about lowered bytes.
// RED at HEAD: each `params:` row emits nothing.
// ===========================================================================

describe("bug 0097 (e) — descending into arms keeps the per-field diagnostic precedence", () => {
  it("RED (e1): a Ghost in one arm and junk in the other renders ONE diagnostic, the Ghost", () => {
    // The junk-side refusal is suppressed by `parseParams`'s same-iteration
    // guard (`src/parser/params.ts`): a field that already drew an error-severity
    // diagnostic this iteration keeps that one alone. code-registry-load.md:19
    // states the rule — "a field already carrying an error-severity diagnostic
    // from its own type-side parse or lowering … keeps that diagnostic and
    // draws no text refusal".
    expectParamsRefused(
      "e1",
      paramSrc("{a: Ghost} | {b: ???}"),
      [unresolvedLine("Ghost")],
      "bug 0059's suppression still suppresses: the unresolved name is the field's one diagnostic, and the `???` fragment draws no second",
    );
  });

  it("RED (e2): a junk default beside a refusing type renders ONE diagnostic, the Ghost", () => {
    // The default half's checks sit behind the type half's disposition in
    // `parseParams` (`src/parser/params.ts`), so a field whose TYPE half refuses draws
    // exactly one diagnostic. CONTROL a11 pins the same shape with a type half
    // that loads.
    expectParamsRefused(
      "e2",
      paramSrc("{a: Ghost} | {b: integer} = 7"),
      [unresolvedLine("Ghost")],
      "code-registry-load.md:19's precedence rules keep the field to one diagnostic per offending field",
    );
  });

  it("RED (e3): a Ghost in EACH arm renders TWO diagnostics at `params:`", () => {
    // Not new behaviour: CONTROL a10 shows this position already renders one
    // diagnostic per unresolved OCCURRENCE for `{a: Ghost, b: Ghost}`, where
    // the alias RHS renders one per NAME. Pinned here so the per-occurrence
    // posture is on the record and the fix is shown not to have moved it.
    expectParamsRefused(
      "e3",
      paramSrc("{a: Ghost} | {b: Ghost}"),
      [unresolvedLine("Ghost"), unresolvedLine("Ghost")],
      "one diagnostic per unresolved occurrence, exactly as the single-group spelling `{a: Ghost, b: Ghost}` renders today (CONTROL a10)",
    );
  });

  it("RED (e4): a non-`Type` fragment inside a union's brace arm converges on this position's OWN registered code", () => {
    // frontmatter-fields-a.md:58 and code-registry-load.md:19: the brace-frame
    // exemption is the FRAGMENT's own, not its enclosure's, so `{a: ???}` as a
    // whole stays admitted while the field type `???` reached THROUGH the
    // hoist is refused. CONTROL a9 pins the single-group spelling of exactly
    // that, unchanged by this fix; the body positions are pinned first, and
    // they carry their own code (code-registry-parse.md:91) because the
    // `params:` position's refusal is a load-phase row.
    for (const [label, source, expected] of [
      [
        "the `schema X = …` alias RHS",
        aliasSrc("string | {a: ???}"),
        [schemaNotExpressionLine("X")],
      ],
      [
        "the `schema` body field type",
        fieldSrc("string | {a: ???}"),
        [schemaNotExpressionLine("S")],
      ],
    ] as const) {
      const doc = parseDoc(source, "bug0097.theta");
      expect(
        diagLines(doc),
        `CONTROL ${label}: the body positions already refuse this text; observed ${JSON.stringify(diagLines(doc))}`,
      ).toEqual([...expected]);
    }

    expectParamsRefused(
      "e4",
      paramSrc("string | {a: ???}"),
      [paramsNotExpressionLine("p")],
      "code-registry-load.md:19 — a brace-free fragment reached through a hoisted inline object's field type is refused like any other, whatever encloses the hoist",
    );
  });
});

// ===========================================================================
// (f) THE BINDER SURFACES — §Fix constraint 7. `relaxParamsSchema`
// (src/binder/binder-envelope.ts:137) copies `properties` and `$defs`
// verbatim, so the lowered fragment reaches the binder model's forced-tool
// input schema unchanged; `BypassParamsField.type` (:170) and
// `renderBinderParamLine` (src/binder/binder-system-prompt.ts:168) carry the
// author's own text and do not move.
// RED at HEAD: f1. GREEN at HEAD: f2.
// ===========================================================================

describe("bug 0097 (f) — the binder envelope carries the arms, and the rendered line does not move", () => {
  it("RED (f1): the envelope's `ok.args` carries the two-arm `anyOf` with both fragments at the ENVELOPE root", () => {
    const loaded = loadCleanly("f1", paramSrc("{a: integer} | {b: integer}"));
    const envelope = buildBinderEnvelopeSchema({
      paramsSchema: loaded.loweredSchema,
      defaultedFields: [],
    }) as Record<string, unknown>;
    const arms = envelope["anyOf"];
    if (!Array.isArray(arms)) {
      throw new Error(
        `f1: the envelope must be a three-arm \`anyOf\` over \`kind\`; observed ${JSON.stringify(envelope)}`,
      );
    }
    const okArm = arms.find((arm) => {
      const props = (arm as { properties?: Record<string, unknown> }).properties;
      return (props?.["kind"] as { const?: unknown } | undefined)?.const === "ok";
    }) as Record<string, unknown> | undefined;
    if (okArm === undefined) {
      throw new Error(
        `f1: the envelope carries no \`ok\` arm, so there is no \`args\` schema for the binder's structured output; observed ${JSON.stringify(envelope)}`,
      );
    }
    const args = (okArm["properties"] as Record<string, unknown>)["args"];
    expect(
      args,
      `§Fix constraint 7 — \`relaxParamsSchema\` copies \`properties\` verbatim, so the \`ok\` arm's \`args\` states the declared union rather than a required \`a\` whose type asserts nothing; observed ${JSON.stringify(args)}`,
    ).toEqual({
      type: "object",
      properties: { p: UNION_ROOT },
      required: ["p"],
      additionalProperties: false,
    });
    expect(
      envelope["$defs"],
      `both arm fragments must be closed at the ENVELOPE document root — JSON-Schema \`#/…\` pointers resolve from the document root, so a closure left nested inside \`args\` is unreachable; observed ${JSON.stringify(envelope["$defs"])}`,
    ).toEqual(UNION_DEFS);
    expectRefsClosed("f1 envelope", envelope);
  });

  it("CONTROL (f2): the recorded surface type and the rendered `Parameters:` line are the author's own bytes", () => {
    // GREEN now and after. `BypassParamsField.type` is "The field's declared
    // surface type", so the per-field line renders what the author wrote
    // regardless of what the lowering makes of it — which is why the binder is
    // shown a union while the envelope it is constrained by is not one.
    const loaded = loadCleanly("f2", paramSrc("{a: integer} | {b: integer}"));
    const field = fieldOf(loaded, "p");
    expect(
      field.type,
      "the declared surface type is recorded verbatim from the `params:` scalar",
    ).toBe("{a: integer} | {b: integer}");
    expect(field.hasDefault, "no `= <literal>` was written").toBe(false);
    expect(field.nullable, "no top-level `| null` arm").toBe(false);
    expect(
      renderBinderParamLine({
        wireName: field.wireName,
        type: field.type,
        requirement: { kind: "required" },
      }),
      "§Fix constraint 7 — the rendered per-field line does not change: it carries the author's own text",
    ).toBe("  p ({a: integer} | {b: integer}) required");
  });
});
