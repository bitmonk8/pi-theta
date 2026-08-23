import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { buildBodyTypeSchemas } from "../src/parser/body-type-lowering";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0245 — a `schema` object body that reaches end of input with at least one
// field captured draws ZERO diagnostics, registers, and lowers
// (docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md).
//
// THE RULE. `SchemaShape ::= "{" Field ("," Field)* ","? "}"`
// (docs/spec_topics/grammar.md §"schema X by <field>") spells the closing `}`
// as a required terminal with no alternative, and
// docs/spec_topics/schemas.md §Object schema restates the field list in prose
// ("Fields are comma-separated; the trailing comma is optional"). A source that
// ends before that `}` derives from no production, so it is not a theta 1.0
// source and the load is refused.
//
// THE DEFECT AT HEAD. `parseSchemaObjectBody`
// (`src/parser/theta-document.ts`) leaves its field loop four ways: the `}`,
// the three recovery arms through `recoverMalformedSchemaField`, and
// `if (this.atEnd()) { break; }`. The fourth exit pushes nothing and falls
// through to `return fields`, so `finishObjectSchema` records the ordinary
// `schema` statement and `schema S { a: string,` at EOF is observationally
// identical to `schema S { a: string }` on all three channels measured here —
// the diagnostic list, the recorded field sources, and the lowered body from
// `buildBodyTypeSchemas` (`src/parser/body-type-lowering.ts`). Where the
// truncation falls inside a nested inline object type the lowered artefact also
// stops matching the source: `b: {c: integer,` lowers property `b` to the
// accept-anything `{}` while the closed twin `b: {c: integer}` lowers to a
// `$ref` into a `$defs` fragment carrying `properties.c` and `required: ["c"]`
// — and the same fragment written explicitly (`b: {}`) is refused, on the
// rationale docs/spec_topics/schemas.md §Object schema states (the empty shape
// "would silently accept every object").
//
// THE CONTRACT THIS FILE PINS — the settled route, one emission per unclosed
// body, no recovery and no other observable moved:
//   1. A NEW registered row, minted in the fix's own commit under DIAG-2
//      (docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-2):
//      `theta/parse/schema-body-unclosed`, severity E, phase parse,
//      placeholder-free *Message*. It is not a widening of
//      `theta/parse/fn-param-list-unclosed`, whose *Trigger*
//      (docs/spec_topics/diagnostics/code-registry-parse.md §row
//      `theta/parse/fn-param-list-unclosed`) fences itself to `fn` parameter
//      lists and whose *Message* names a parameter list — false of a schema
//      body, and rewording it would be a DIAG-4 reword deferred to theta 2.0.
//   2. Emission site: `parseSchemaObjectBody`'s `atEnd()` loop exit. The range
//      is the body's OPENING `{` token, mirroring `fn-param-list-unclosed`,
//      which ranges on the opening `(` — the subject is the body that was
//      opened and never closed.
//   3. Fires only on a NON-EMPTY captured field prefix. An EMPTY prefix
//      (`schema S {`) keeps `theta/parse/empty-schema-body` ALONE; whether that
//      row's *Message* should also name the missing `}` is fenced by the bug
//      document's §Non-goals as a DIAG-4 wording question.
//   4. WITHHELD when a field-TYPE capture consumed an unmatched `}` — strictly
//      more `}` punctuation tokens than `{` over the token span that capture
//      consumed — the exact analogue of `fn-param-list-unclosed`'s landed
//      absorbed-`)` withhold. The closer the author wrote was swallowed by the
//      type, not omitted, so the input keeps its capture-level disposition.
//   5. Nothing else moves: the captured prefix is still returned,
//      `finishObjectSchema` still records the ordinary `schema` statement, and
//      the three recovery arms and `recoverMalformedSchemaField` (bug 0133's
//      subject) are untouched. The code is `E`, so the composition root's
//      registration gate (`hasLoadParseError`,
//      `src/extension/production-composition.ts`, whose predicate is
//      `!diagnostics.some(d => d.severity === "error")`) denies registration.
//   6. The `enum` sibling stays SILENT: `parseEnumVariants`' loop bound has the
//      same shape and the same EOF exit, and the bug document's §Non-goals
//      keeps it out of scope. Group (f) asserts that silence as a fence.
//
// GOVERNANCE. The addition is covered by the diagnostic-registry carve-out
// (docs/spec_topics/governance/source-language-stability.md
// #diagnostic-registry-carve-out): every input group (a)–(c) newly refuses
// emits NOTHING at HEAD, so it sits in GOV-15's loads-cleanly set (#gov-15) and
// the edit is an addition on inputs that were outside the code's emission set —
// not a rename, a severity change, or a reword of anything an in-scope input
// already observes.
//
// THE LEDGER — what each group pins:
//   - (R): the DIAG-2 row itself.
//   - (a): the subject and its closed control on all three channels.
//   - (b): the class boundary — no comma, two fields, trailing comma, the
//     `as "A"` rename, and the trailing newline: the omitted `}` is the
//     trigger, not the comma.
//   - (c): the nested inline truncation and its two controls. The lowered `{}`
//     is pinned as the REASON for the refusal — the lowering itself does not
//     change; the refusal is what stops that fragment reaching a provider.
//   - (d): the empty-prefix fence, the mid-field-name fence (`b`) and the
//     statements-after-the-body row keep their HEAD behaviour with no new line
//     beside them; the mid-field-TYPE truncation (`b:`) names both faults,
//     since the absent `}` does not depend on the type's own refusal.
//   - (e): MUST NOT MOVE — the withhold arm. Its first two rows are also
//     pinned by sibling suites (the `array<integer }` shape and bug 0217's
//     `array<enum["a", "b"> }` fence), so a route that emitted here would red
//     them too. Its third row fences the withhold's own limit: a `}` inside a
//     string token is not a consumed closer.
//   - (f): MUST NOT MOVE — the `enum` §Non-goals fence.
//   - (g): the cross-form symmetry control — `fn f(a: string,` at EOF, already
//     refused by bug 0151's landed row.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-4) IS BINDING.
// No asserted diagnostic message is written out: every one is READ from the
// registry's *Message* column through `parseRegistry` / `registryMessage`
// (`tools/code-registry/index.js`) via the `msg` helper, INCLUDING the new
// row's. Until the implementer adds the `theta/parse/schema-body-unclosed` row
// to docs/spec_topics/diagnostics/code-registry-parse.md (and its
// docs/reference/diagnostics.md mirror), `msg` reds by NAMING the registry.
// That red is intended: DIAG-2 makes the row part of the same commit. Group (R)
// is the one place a literal appears, because there the string is not an oracle
// read but the specification of the row's own content.
//
// ANTI-VACUITY. Every row asserts an ORDERED WHOLE-LIST equality over the
// UNFILTERED `doc.diagnostics` — never containment — so neither an extra
// diagnostic nor one at the wrong position can hide. The structural
// (severity, code, range) list is asserted BEFORE the registry-message list in
// each row, so a missing emission reds as a missing diagnostic rather than as a
// missing registry row. Fourteen of the twenty rows expect a non-empty list, so
// a harness that stopped reaching the parser fails loudly rather than turning
// the empty-list fence rows into silent passes.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string plus one
// `buildBodyTypeSchemas` call over its statements — no session, no host, no
// model — so an integration tier would add a round trip to a parse-time value
// and reach nothing more, and a live tier would make a fully determined value
// stochastic.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. `msg` asserts its registry row's presence before the
// template is used, and `schemaOf` / `enumOf` assert their declaration's
// presence before its fields or variants are read.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row — the state of `theta/parse/schema-body-unclosed` until the
 * DIAG-2 addition lands — reds by naming the registry rather than by a bare
 * `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  expect(
    typeof template === "string" && template.length > 0,
    `DIAG-4: the ${code} Message column must be a non-empty string; got ${JSON.stringify(template)}`,
  ).toBe(true);
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

/** The new row this bug's fix adds under DIAG-2 (absent at HEAD). */
const UNCLOSED = "theta/parse/schema-body-unclosed";
/** The empty-prefix row, which keeps the empty body ALONE (fence (d)). */
const EMPTY_BODY = "theta/parse/empty-schema-body";
/** Bug 0061's row — the mid-field-type fence. */
const TYPE_NOT_EXPR = "theta/parse/schema-type-not-expression";
/** Bug 0133's row — the mid-field-name fence, emitted by a recovery arm. */
const MALFORMED_FIELD = "theta/parse/malformed-schema-field";
/** Bug 0151's landed row — the same shape one declaration form over. */
const FN_UNCLOSED = "theta/parse/fn-param-list-unclosed";
/** The lexer's own unrelated line, beside the `fn` row in group (g). */
const SINGLE_LINE_IF = "theta/parse/single-line-if";
/** The inline-`enum[...]` refusal, which the string-token fixture in (e) also draws. */
const INLINE_ENUM = "theta/parse/inline-enum";

// ===========================================================================
// Parse harness — the same shape as tests/fn-param-list-unclosed.test.ts.
// ===========================================================================
//
// `parseDoc` (`tests/helpers/e2e-s1.ts`) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the lexer and parser under assertion are the production ones.

/** Frontmatter for every row — occupies lines 1–3, so body line 1 is file line 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` under the standard frontmatter. */
function theta(body: string): ThetaDocument {
  return parseDoc(FM + body, "test.theta");
}

/**
 * The span of the body's opening `{` in every `schema S { …` fixture below.
 * Line 4 carries the declaration (the frontmatter takes lines 1–3); within
 * `schema S {` the characters are `s`=1 … `a`=6, ` `=7, `S`=8, ` `=9, `{`=10,
 * and the end column is exclusive. The `{` is the range because the subject is
 * the body that was opened and never closed.
 */
const OPEN_BRACE = "4:10-4:11";

/** One diagnostic reduced to its structural triple — severity, code, span. */
interface Triple {
  readonly severity: string;
  readonly code: string;
  readonly at: string;
}

/** `l:c-l:c`, 1-indexed, end-column exclusive; `-` for an unlocated diagnostic. */
function at(r: SourceRange | undefined): string {
  return r === undefined
    ? "-"
    : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** The structural triples of every diagnostic, in report order. */
function triples(doc: ThetaDocument): Triple[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    at: at(d.range),
  }));
}

/** An expected structural triple (severity is `error` for every row here). */
function e(code: string, span: string): Triple {
  return { severity: "error", code, at: span };
}

/** One diagnostic reduced to the full quadruple, message included. */
interface Quad extends Triple {
  readonly message: string;
}

/** The full quadruples of every diagnostic, in report order. */
function quads(doc: ThetaDocument): Quad[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    at: at(d.range),
    message: d.message,
  }));
}

/** An expected quadruple whose message is read from the registry (DIAG-4). */
function q(
  code: string,
  span: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): Quad {
  return { severity: "error", code, at: span, message: msg(code, fills) };
}

/** Every diagnostic rendered for a failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(quads(doc));
}

/** The top-level statement kinds, in source order. */
function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}

/**
 * The single `schema` declaration of `doc`. Presence and uniqueness are
 * asserted before the read, so a row whose declaration vanished reds by naming
 * that rather than by dereferencing `undefined`.
 */
function schemaOf(doc: ThetaDocument): SchemaDecl {
  const decls = doc.body.statements.filter((s) => s.kind === "schema") as SchemaDecl[];
  expect(
    decls.length,
    `exactly one \`schema\` declaration is expected; statements=${JSON.stringify(topKinds(doc))}, diagnostics=${render(doc)}`,
  ).toBe(1);
  const only = decls[0];
  if (only === undefined) {
    throw new Error(`no \`schema\` declaration to read; diagnostics=${render(doc)}`);
  }
  return only;
}

/** The single `enum` declaration of `doc`, presence asserted before the read. */
function enumOf(doc: ThetaDocument): EnumDecl {
  const decls = doc.body.statements.filter((s) => s.kind === "enum") as EnumDecl[];
  expect(
    decls.length,
    `exactly one \`enum\` declaration is expected; statements=${JSON.stringify(topKinds(doc))}, diagnostics=${render(doc)}`,
  ).toBe(1);
  const only = decls[0];
  if (only === undefined) {
    throw new Error(`no \`enum\` declaration to read; diagnostics=${render(doc)}`);
  }
  return only;
}

/**
 * The recorded field sources of the single `schema`, rendered `name: type` with
 * the `as "WireName"` rename spelled when present. This is the channel the
 * unclosed body shares with its closed twin, so the prefix retention clause (5)
 * is asserted on it rather than inferred.
 */
function fieldsOf(doc: ThetaDocument): string[] {
  return (schemaOf(doc).fields ?? []).map((f) =>
    f.wireName === undefined ? `${f.name}: ${f.typeSource}` : `${f.name} as "${f.wireName}": ${f.typeSource}`,
  );
}

/**
 * The lowered bodies of every `schema` and `enum` the document declares — the
 * third channel, produced by the shipped `buildBodyTypeSchemas` over the parsed
 * statements exactly as the runtime's own lowering call does.
 */
function lowered(doc: ThetaDocument): Record<string, unknown> {
  const schemas = (doc.body.statements.filter((s) => s.kind === "schema") as SchemaDecl[]).map(
    (s) => ({
      name: s.name,
      ...(s.fields === undefined ? {} : { fields: s.fields }),
      ...(s.arms === undefined ? {} : { arms: s.arms }),
    }),
  );
  const enums = (doc.body.statements.filter((s) => s.kind === "enum") as EnumDecl[]).map((d) => ({
    name: d.name,
    ...(d.variants === undefined ? {} : { variants: d.variants }),
    ...(d.variantValues === undefined ? {} : { variantValues: d.variantValues }),
  }));
  return Object.fromEntries(buildBodyTypeSchemas(schemas, enums).entries());
}

/**
 * The composition root's own registration gate (`hasLoadParseError`,
 * `src/extension/production-composition.ts`):
 * `!diagnostics.some(d => d.severity === "error")`.
 */
function registered(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

/** The lowered body of `S` with one required `string` field `a` — groups (a)/(b). */
const S_ONE_STRING = {
  type: "object",
  properties: { a: { type: "string" } },
  required: ["a"],
  additionalProperties: false,
};

// ===========================================================================
// (R) The DIAG-2 addition itself.
// ===========================================================================

describe("b0245 registry — the new row is a DIAG-2 addition in the fix's own commit", () => {
  it("b0245-R1: code-registry-parse.md carries `theta/parse/schema-body-unclosed` with a placeholder-free Message", () => {
    // DIAG-1 requires every emission to carry a registered code and DIAG-2
    // requires the row to land in the same commit as the site. The *Message* is
    // placeholder-free BY DESIGN: the diagnostic names the body, not a binder,
    // so no `<construct>` rendering rule is engaged — which is why a row is
    // minted rather than reusing `theta/parse/fn-param-list-unclosed`, whose
    // *Message* names a parameter list and is false of a schema body.
    const template = registryMessage(REGISTRY, UNCLOSED) as string | undefined;
    expect(
      template,
      `DIAG-2: the fix adds the ${UNCLOSED} row to docs/spec_topics/diagnostics/code-registry-parse.md (and the docs/reference/diagnostics.md mirror) in its own commit`,
    ).toBe("schema object body is not closed by '}'");
  });
});

// ===========================================================================
// (a) The subject and its closed control, on all three channels.
// ===========================================================================

describe("b0245 (a) — a body that reaches EOF after a captured field is refused", () => {
  it("b0245-a1: `schema S { a: string,` at EOF reports the unclosed body, keeps the field, and does not register", () => {
    // THE ROOT ROW. At HEAD this is the report's claim in one line: zero
    // diagnostics, `registered=true`, and a lowered `S` the source never
    // finished writing.
    const doc = theta("schema S { a: string,");
    expect(
      triples(doc),
      `grammar.md §"schema X by <field>" spells the closing \`}\` as a required terminal of SchemaShape; diagnostics=${render(doc)}`,
    ).toEqual([e(UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4 — the rendered prose is the registry's Message column").toEqual([
      q(UNCLOSED, OPEN_BRACE),
    ]);

    // Clause (5): the captured prefix is still returned and the statement is
    // still the ordinary `schema` one, so the emission is the ONLY observable
    // that moves. A route that discarded the prefix would move bug 0133's
    // retention disposition, which is not this fix's to touch.
    expect(topKinds(doc), "the declaration is still recorded").toEqual(["schema"]);
    expect(fieldsOf(doc), `the captured prefix is retained; diagnostics=${render(doc)}`).toEqual([
      "a: string",
    ]);
    expect(lowered(doc), "the lowering itself is unchanged — the refusal is what closes the hole").toEqual(
      { S: S_ONE_STRING },
    );
    expect(
      registered(doc),
      `the E denies registration through the composition root's gate; diagnostics=${render(doc)}`,
    ).toBe(false);
  });

  it("b0245-a2: the closed control `schema S { a: string }` is untouched on all three channels", () => {
    // The control the subject is currently indistinguishable from. It must stay
    // clean: the trigger is the omitted `}`, and this row has one.
    const doc = theta("schema S { a: string }");
    expect(triples(doc), `a closed body derives from SchemaShape; diagnostics=${render(doc)}`).toEqual(
      [],
    );
    expect(fieldsOf(doc), "the closed body's field sources").toEqual(["a: string"]);
    expect(lowered(doc), "the closed body's lowered artefact").toEqual({ S: S_ONE_STRING });
    expect(registered(doc), "a clean load registers").toBe(true);
  });
});

// ===========================================================================
// (b) The class boundary — the omitted `}` is the trigger, not the comma.
// ===========================================================================

describe("b0245 (b) — every shape whose last field completed before EOF is refused", () => {
  it("b0245-b1: `schema S { a: string` (no trailing comma) is refused identically", () => {
    const doc = theta("schema S { a: string");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(UNCLOSED, OPEN_BRACE)]);
    expect(fieldsOf(doc), "the prefix is retained").toEqual(["a: string"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0245-b2: `schema S { a: string, b: integer` — two fields, one emission", () => {
    // One diagnostic per unclosed body, not one per captured field: the subject
    // is the body, which was opened once.
    const doc = theta("schema S { a: string, b: integer");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(UNCLOSED, OPEN_BRACE)]);
    expect(fieldsOf(doc), "both fields are retained").toEqual(["a: string", "b: integer"]);
    expect(lowered(doc), "the retained fields lower as written").toEqual({
      S: {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "integer" } },
        required: ["a", "b"],
        additionalProperties: false,
      },
    });
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0245-b3: `schema S { a: string, b: integer,` — the optional trailing comma changes nothing", () => {
    // schemas.md §Object schema makes the trailing comma optional, so it is not
    // the discriminator either way.
    const doc = theta("schema S { a: string, b: integer,");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(UNCLOSED, OPEN_BRACE)]);
    expect(fieldsOf(doc), "both fields are retained").toEqual(["a: string", "b: integer"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it('b0245-b4: `schema S { a as "A": string,` — the rename is retained beside the emission', () => {
    // schemas.md §Wire-name renaming: the `as "WireName"` clause is part of the
    // Field, so a renamed field is a captured prefix like any other and its
    // wire name survives the refusal.
    const doc = theta('schema S { a as "A": string,');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(UNCLOSED, OPEN_BRACE)]);
    expect(fieldsOf(doc), "the wire name is retained").toEqual(['a as "A": string']);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0245-b5: a trailing newline after the comma is still EOF", () => {
    // The newline inside an open brace group is swallowed as a continuation
    // (grammar.md §Newline continuation), so it moves no boundary: the loop
    // still reaches `atEnd()` between fields.
    const doc = theta("schema S { a: string,\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(UNCLOSED, OPEN_BRACE)]);
    expect(fieldsOf(doc), "the prefix is retained").toEqual(["a: string"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });
});

// ===========================================================================
// (c) The nested inline truncation — the lowered artefact and its two controls.
// ===========================================================================

describe("b0245 (c) — a truncation inside a nested inline object type is refused, so its `{}` never ships", () => {
  it("b0245-c1: `schema S { a: string, b: {c: integer,` is refused, and the `{}` fragment is the reason", () => {
    // The field-TYPE capture takes the unterminated `{c: integer,`, so the
    // OUTER body is what never closed and the emission ranges on its `{`. The
    // withhold of clause (4) does not reach here: the capture consumed one `{`
    // and no `}`, so no closer was swallowed.
    const doc = theta("schema S { a: string, b: {c: integer,");
    expect(
      triples(doc),
      `the outer SchemaShape's \`}\` is absent; diagnostics=${render(doc)}`,
    ).toEqual([e(UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(UNCLOSED, OPEN_BRACE)]);
    expect(fieldsOf(doc), "the unterminated type text is retained verbatim").toEqual([
      "a: string",
      "b: {c: integer,",
    ]);

    // The lowering is UNCHANGED by this fix — pinned here as the reason the
    // refusal matters, not as a thing the fix moves. Property `b` lowers to
    // `{}`, the JSON Schema that accepts every value, where the source declares
    // an object with one required integer field; schemas.md §Object schema
    // refuses that fragment's explicit spelling precisely because it "would
    // silently accept every object". The refusal above is what stops this
    // artefact reaching a provider: nothing that ends mid-body registers.
    expect(
      lowered(doc),
      "the truncated nested body lowers `b` to the accept-anything fragment",
    ).toEqual({
      S: {
        type: "object",
        properties: { a: { type: "string" }, b: {} },
        required: ["a", "b"],
        additionalProperties: false,
      },
    });
    expect(
      registered(doc),
      `the refusal is what keeps the {} fragment off the wire; diagnostics=${render(doc)}`,
    ).toBe(false);
  });

  it("b0245-c2: the closed twin `b: {c: integer} }` keeps its `$ref` and its `$defs` fragment", () => {
    // The control that shows what the source spells: a hoisted `$defs`
    // fragment carrying `properties.c` and `required: ["c"]`. Unchanged.
    const doc = theta("schema S { a: string, b: {c: integer} }");
    expect(triples(doc), `a closed body derives; diagnostics=${render(doc)}`).toEqual([]);
    expect(lowered(doc), "the closed twin hoists the declared field `c`").toEqual({
      S: {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { $ref: "#/$defs/__inline_562094ebf0ccad82" },
        },
        required: ["a", "b"],
        additionalProperties: false,
        $defs: {
          __inline_562094ebf0ccad82: {
            type: "object",
            properties: { c: { type: "integer" } },
            required: ["c"],
            additionalProperties: false,
          },
        },
      },
    });
    expect(registered(doc), "a clean load registers").toBe(true);
  });

  it("b0245-c3: the explicit spelling `b: {}` keeps `empty-schema-body` ALONE", () => {
    // The same lowered fragment, written out: already refused, and by its own
    // row. This fix adds no second line to it — the body here is closed.
    const doc = theta("schema S { a: string, b: {} }");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(EMPTY_BODY, "4:1-4:30")]);
    expect(quads(doc), "DIAG-4 — the empty-body row names the offending shape").toEqual([
      q(EMPTY_BODY, "4:1-4:30", [["<X>", "{}"]]),
    ]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });
});

// ===========================================================================
// (d) MUST NOT MOVE — the empty-prefix fence and the mid-field fences.
// ===========================================================================

describe("b0245 (d) — the neighbouring exits keep their own single diagnostic", () => {
  it("b0245-d1: `schema S {` (EMPTY captured prefix) keeps `empty-schema-body` alone", () => {
    // Clause (3). Whether that row's *Message* should also name the missing `}`
    // is a DIAG-4 wording question the bug document's §Non-goals fences, so the
    // new row must NOT fire here: an empty prefix keeps exactly one line.
    const doc = theta("schema S {");
    expect(
      triples(doc),
      `an empty captured prefix is the empty-schema-body row's own subject; diagnostics=${render(doc)}`,
    ).toEqual([e(EMPTY_BODY, "4:1-4:11")]);
    expect(quads(doc), "DIAG-4").toEqual([q(EMPTY_BODY, "4:1-4:11", [["<X>", "S"]])]);
    expect(fieldsOf(doc), "no field derived").toEqual([]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });

  it("b0245-d2: `schema S { a: string, b:` names BOTH the type refusal and the unclosed body", () => {
    // Two independent faults, so two lines: bug 0061's row judges the empty
    // field-TYPE capture, and the body is separately never closed by `}` —
    // delete the refused type position and the body is still unclosed, so
    // neither verdict is derived from the other. The same pairing `fn f(a:` at
    // EOF draws, where `theta/parse/fn-param-list-unclosed` fires beside the
    // parameter's own refusal. The list order is the diagnostic list's own
    // (file, line, col) order.
    const doc = theta("schema S { a: string, b:");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(TYPE_NOT_EXPR, "4:1-4:25"),
      e(UNCLOSED, OPEN_BRACE),
    ]);
    expect(quads(doc), "DIAG-4").toEqual([
      q(TYPE_NOT_EXPR, "4:1-4:25", [["<X>", "S"]]),
      q(UNCLOSED, OPEN_BRACE),
    ]);
    expect(fieldsOf(doc), "the empty type capture is recorded as written").toEqual([
      "a: string",
      "b: ",
    ]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });

  it("b0245-d3: `schema S { a: string, b` keeps `malformed-schema-field` alone", () => {
    // Bug 0133's arm 3, ranged on the field name that carries no type. The
    // recovery arms are that report's LOCKED subject; this fix reaches only the
    // fourth exit, so exactly one line stands here.
    const doc = theta("schema S { a: string, b");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(MALFORMED_FIELD, "4:23-4:24")]);
    expect(quads(doc), "DIAG-4 — placeholder-free").toEqual([q(MALFORMED_FIELD, "4:23-4:24")]);
    expect(fieldsOf(doc), "arm 3 discards the untyped field and retains the prefix").toEqual([
      "a: string",
    ]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });

  it("b0245-d4: text after the unclosed body is read as field material and keeps its own line", () => {
    // Silence needs the file to END. `let` is a keyword, so it is admitted as a
    // field name and the missing `:` takes arm 3 at line 5 — a token exists, so
    // this is bug 0133's territory, not this fix's.
    const doc = theta("schema S { a: string,\nlet a = 1\na\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(MALFORMED_FIELD, "5:1-5:4")]);
    expect(quads(doc), "DIAG-4 — placeholder-free").toEqual([q(MALFORMED_FIELD, "5:1-5:4")]);
    expect(fieldsOf(doc), "the prefix is retained").toEqual(["a: string"]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });
});

// ===========================================================================
// (e) MUST NOT MOVE — the withhold arm (clause (4)).
// ===========================================================================

describe("b0245 (e) — a field type that swallowed the body's `}` withholds the verdict", () => {
  it("b0245-e1: `schema S { a: array<integer }` keeps HEAD's silence", () => {
    // Clause (4), the analogue of `fn-param-list-unclosed`'s landed absorbed-`)`
    // withhold (code-registry-parse.md §row
    // `theta/parse/fn-param-list-unclosed`). The unfloored angle-depth counter
    // inside `parseType` (`src/parser/theta-document.ts`) pulls the body's own
    // `}` INTO the field type — visible in the recorded `typeSource` below — so
    // the closer the author wrote was swallowed, not omitted, and the input
    // keeps its capture-level disposition unchanged.
    const doc = theta("schema S { a: array<integer }");
    expect(
      triples(doc),
      `the type capture consumed the body's own closer; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(fieldsOf(doc), "the absorbed `}` is visible in the captured type text").toEqual([
      "a: array<integer}",
    ]);
    expect(registered(doc), "withheld, so HEAD's clean load stands").toBe(true);
  });

  it('b0245-e2: `schema S { a: array<enum["a", "b"> }` keeps HEAD\'s silence (bug 0217\'s fence)', () => {
    // The second withhold shape: an unclosed bracket group inside a generic
    // argument, whose extent bug 0217 leaves unknown. Its `}` is absorbed the
    // same way, so the withhold covers it and that report's fence does not move.
    const doc = theta('schema S { a: array<enum["a", "b"> }');
    expect(
      triples(doc),
      `the type capture consumed the body's own closer; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(fieldsOf(doc), "the absorbed `}` is visible in the captured type text").toEqual([
      'a: array<enum["a","b">}',
    ]);
    expect(registered(doc), "withheld, so HEAD's clean load stands").toBe(true);
  });

  it('b0245-e3: `schema S { a: enum["}"], b: string` at EOF fires — a `}` inside a string token is no closer', () => {
    // The withhold's own limit. The counter that drives it weighs `}` PUNCTUATION
    // tokens, so a `}` carried as a character inside a string or template token
    // spends nothing: the body's closer is still absent and the row fires. The
    // recorded `typeSource` below carries that `}` inside the string literal, so
    // this cell's precondition is visible rather than assumed. The inline-`enum`
    // refusal beside it judges the type spelling and says nothing about the
    // body's closer.
    const doc = theta('schema S { a: enum["}"], b: string');
    expect(
      triples(doc),
      `a string-interior \`}\` is not a consumed closer; diagnostics=${render(doc)}`,
    ).toEqual([e(INLINE_ENUM, "4:1-4:35"), e(UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([
      q(INLINE_ENUM, "4:1-4:35"),
      q(UNCLOSED, OPEN_BRACE),
    ]);
    expect(fieldsOf(doc), "the `}` sits inside the string token of the field type").toEqual([
      'a: enum["}"]',
      "b: string",
    ]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });
});

// ===========================================================================
// (f) MUST NOT MOVE — the `enum` §Non-goals fence.
// ===========================================================================

describe("b0245 (f) — the `enum` variant loop stays silent", () => {
  it("b0245-f1: `enum E { A,` at EOF stays observationally identical to its closed twin", () => {
    // Clause (6). `parseEnumVariants` (`src/parser/theta-document.ts`) has the
    // same loop shape and the same silent EOF exit, and the bug document's
    // §Non-goals keeps it out of scope: it is a different function with a
    // different registry row (`theta/parse/empty-enum-body`,
    // docs/spec_topics/schemas.md §Enum declarations), and widening this fix to
    // it would put two capture loops under one route.
    const truncated = theta("enum E { A,");
    const closed = theta("enum E { A }");
    expect(
      triples(truncated),
      `the enum loop is fenced by §Non-goals; diagnostics=${render(truncated)}`,
    ).toEqual([]);
    expect(triples(closed), `diagnostics=${render(closed)}`).toEqual([]);
    expect(enumOf(truncated).variants, "the captured variant").toEqual(["A"]);
    expect(enumOf(closed).variants, "the closed twin's variant").toEqual(["A"]);
    expect(lowered(truncated), "the truncated enum lowers as its closed twin does").toEqual({
      E: { type: "string", enum: ["A"] },
    });
    expect(lowered(closed), "the closed twin's lowering").toEqual({
      E: { type: "string", enum: ["A"] },
    });
    expect(registered(truncated), "the enum fence keeps HEAD's clean load").toBe(true);
  });
});

// ===========================================================================
// (g) Cross-form symmetry — the `fn` analogue, already refused.
// ===========================================================================

describe("b0245 (g) — the same truncation one declaration form over", () => {
  it("b0245-g1: `fn f(a: string,` at EOF draws bug 0151's landed row, unmoved by this fix", () => {
    // The symmetry control: the row this fix deliberately does NOT widen. Its
    // *Trigger* fences itself to `fn` parameter lists and its *Message* names a
    // parameter list, so a schema body needs its own row (clause (1)). The
    // lexer's `single-line-if` line fires for its own unrelated reason and
    // names neither the list nor the missing `)`.
    const doc = theta("fn f(a: string,");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(SINGLE_LINE_IF, "4:1-4:3"),
      e(FN_UNCLOSED, "4:5-4:6"),
    ]);
    expect(quads(doc), "DIAG-4 — both messages are the registry's").toEqual([
      q(SINGLE_LINE_IF, "4:1-4:3"),
      q(FN_UNCLOSED, "4:5-4:6"),
    ]);
    expect(
      msg(FN_UNCLOSED),
      "the `fn` row's Message names a parameter list, which is false of a schema body — clause (1)'s ground for minting a new row",
    ).not.toBe(msg(UNCLOSED));
    expect(registered(doc), "the landed E denies registration").toBe(false);
  });
});
