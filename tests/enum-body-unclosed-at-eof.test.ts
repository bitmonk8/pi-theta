import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { buildBodyTypeSchemas } from "../src/parser/body-type-lowering";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0259 — an `enum` variant list that reaches end of input with at least one
// variant captured draws ZERO diagnostics, registers, and lowers
// (docs/bugs/0259-unclosed-enum-variant-list-at-eof-loads-clean.md).
//
// THE RULE. docs/spec_topics/schemas.md §Enum declarations spells the closing
// `}` of `enum X { ... }` in its shape line and in every example block, and
// states the separator rule ("Variants are comma-separated; trailing comma
// optional"). Unlike the `schema` object body there is no BNF production for
// `EnumDecl` in docs/spec_topics/grammar.md, so the corpus's spelling of the
// form is the schemas.md §Enum declarations text alone. A source that ends
// before that `}` derives from no `enum` declaration the corpus spells, so it
// is not a theta 1.0 source and the load is refused.
//
// THE DEFECT AT HEAD. `parseEnumVariants` (`src/parser/theta-document.ts`)
// advances past the opening `{`, sets `depth = 1`, and bounds its variant loop
// with `while (!this.atEnd() && depth > 0)`. The `}` arm decrements `depth` and
// is the well-formed exit; when the source runs out instead, the first conjunct
// fails, the loop ends with `depth === 1`, and control falls to the single
// `return { names, values, variantDecls }` with nothing pushed to
// `this.diagnostics`. The return type carries no "how did the loop end" bit, so
// `parseEnum` records the ordinary `enum` statement for both endings alike and
// `enum E { A,` at EOF is observationally identical to `enum E { A }` on all
// three channels measured here — the diagnostic list, the captured variant list
// (and its explicit values) off the recorded statement, and the lowered
// fragment from `buildBodyTypeSchemas` (`src/parser/body-type-lowering.ts`,
// `lowerEnumToSchema`). Registration follows the diagnostics alone
// (`src/extension/production-composition.ts`), so the truncated source
// registers.
//
// Unlike bug 0245's element 2 there is no permissive lowered artefact here: the
// enum lowering has no `{}` analogue and every truncated fragment measured is a
// SUBSET of the finished declaration's, so this defect is silence, not
// over-acceptance. Group (a)'s lowered channel pins that — the refusal, not a
// lowering change, is the whole of the fix.
//
// THE CONTRACT THIS FILE PINS — the settled route, one emission per unclosed
// variant list, nothing else moved:
//   1. A NEW registered row, minted in the fix's own commit under DIAG-2
//      (docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-2):
//      `theta/parse/enum-body-unclosed`, severity E, phase parse,
//      placeholder-free *Message*. It is NOT a widening of
//      `theta/parse/schema-body-unclosed`, whose *Trigger*
//      (docs/spec_topics/diagnostics/code-registry-parse.md §row
//      `theta/parse/schema-body-unclosed`) fences itself out of this position
//      by name ("the `enum` variant list (`parseEnumVariants`) … are not judged
//      by this row") and whose *Message* names a schema object body — false of
//      an enum variant list. Rewording that *Message* to a
//      declaration-body-general form is a DIAG-4 reword, deferred to theta 2.0
//      (docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-4, repeated
//      verbatim by
//      docs/spec_topics/governance/source-language-stability.md §Diagnostic-
//      registry carve-out), so a sibling row is minted instead — exactly the
//      choice bug 0245's §Fix adjudication 1 made for
//      `theta/parse/fn-param-list-unclosed`. Both *Triggers* stay mutually
//      exclusive: 0245's row keeps its `schema`-object-body scope and this row
//      owns `parseEnumVariants`'s EOF exit. Cell b0259-R2 pins the ground for
//      minting — the two *Messages* differ.
//   2. Emission site: `parseEnumVariants`'s `!this.atEnd()` loop exit. The
//      range is the body's OPENING `{` token, mirroring
//      `theta/parse/schema-body-unclosed`'s `openTok.range` and
//      `theta/parse/fn-param-list-unclosed`'s opening `(` — the subject is the
//      body that was opened and never closed. `parseEnumVariants` advances past
//      that token without retaining it, so the fix captures it there.
//   3. Fires only on a NON-EMPTY captured variant list. An EMPTY prefix
//      (`enum E {`, `enum E {\n`, `enum E { ,`, `enum E { {`, `enum E `) keeps
//      `theta/parse/empty-enum-body` ALONE; whether that row's *Message* should
//      also name the missing `}` is fenced by the bug document's §Non-goals as
//      the same DIAG-4 wording question bug 0245 fenced for
//      `theta/parse/empty-schema-body`. Group (d) asserts that fence.
//   4. NO WITHHOLD of any kind. `parseSchemaObjectBody` needs one because a
//      field-TYPE capture can swallow the body's `}`; the enum loop has no
//      capture that consumes a `}` — the `}` arm is the only place a `}` punct
//      token is consumed and it decrements `depth`, and a `}` carried inside a
//      string token is never counted by the `punct`-only depth arms. Group (c)
//      proves the decision sound in both directions: the two brace-accounting
//      truncations fire, and their closed twins stay CLEAN.
//   5. CO-FIRING, not suppression. The absent `}` is independent of a variant's
//      own fault, so the emission joins `theta/parse/non-string-enum-value`,
//      `theta/parse/duplicate-enum-variant-name`,
//      `theta/parse/duplicate-enum-value`,
//      `theta/parse/reserved-keyword-as-identifier` and
//      `theta/parse/unterminated-string` rather than replacing or being
//      replaced by any of them — the disposition
//      `theta/parse/schema-body-unclosed`'s *Trigger* already states for its
//      own position. Group (e) asserts three of those pairings.
//   6. Nothing else moves: the captured names, values and variant decls are
//      still returned, so `parseEnum`, `checkEnumDeclaration`
//      (`src/parser/schema-declarations.ts`) and `buildBodyTypeSchemas` are
//      byte-untouched and the lowering does not change. The code is `E`, so the
//      composition root's registration gate — `!diagnostics.some(d =>
//      d.severity === "error")`, `src/extension/production-composition.ts` —
//      denies registration.
//
// GOVERNANCE. The addition is covered by the diagnostic-registry carve-out
// (docs/spec_topics/governance/source-language-stability.md
// #diagnostic-registry-carve-out): every input groups (a)–(c) newly refuse
// emits NOTHING at HEAD, so it sits in GOV-15's loads-cleanly set (#gov-15) and
// the edit is an addition on inputs that were outside the code's emission set —
// not a rename, a severity change, or a reword of anything an in-scope input
// already observes. The group (e) inputs already carry another row's refusal,
// which this row's emission joins rather than replaces.
//
// THE LEDGER — what each group pins:
//   - (R): the DIAG-2 row itself, and the *Message* difference that grounds
//     minting rather than rewording.
//   - (a): the subject and its closed control on all three channels, plus
//     registration.
//   - (b): the class boundary — no comma, two variants, trailing comma, the
//     trailing newline, a complete explicit value, a half-written explicit
//     value, a non-identifier token, and a preceding statement: the omitted `}`
//     is the trigger, not the comma and not the variant count.
//   - (c): the two brace-accounting truncations AND their closed twins. The
//     twins are the no-withhold decision's tripwire: a route that withheld on a
//     `}` the author wrote for something else would red (c1)–(c3), and a route
//     that fired on a body that IS closed would red (c4)–(c6).
//   - (d): the empty-prefix fence — five spellings, each keeping
//     `theta/parse/empty-enum-body` ALONE with no new line beside it.
//   - (e): the co-firing rows. Each variant-level refusal draws its own line
//     BESIDE the new one, in the diagnostic list's own (file, line, col) order
//     (`assembleDiagnostics`, `src/diagnostics/diagnostic.ts`).
//   - (f): the cross-form symmetry controls — `schema S { a: string,` keeps bug
//     0245's landed row and `fn f(a: string,` keeps bug 0151's, both unmoved.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-4) IS BINDING.
// No asserted diagnostic message is written out: every one is READ from the
// registry's *Message* column through `parseRegistry` / `registryMessage`
// (`tools/code-registry/index.js`) via the `msg` helper, INCLUDING the new
// row's. Until the implementer adds the `theta/parse/enum-body-unclosed` row to
// docs/spec_topics/diagnostics/code-registry-parse.md (and its
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
// missing registry row. Twenty-six of the twenty-eight rows assert a whole
// diagnostic list (the two (R) rows read the registry alone); twenty-two of
// those twenty-six expect a NON-EMPTY list, so a harness that stopped reaching
// the parser fails loudly rather than turning the four empty-list rows —
// (a2) and the three closed twins of (c) — into silent passes.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string plus one
// `buildBodyTypeSchemas` call over its statements — no session, no host, no
// model — so an integration tier would add a round trip to a parse-time value
// and reach nothing more, and a live tier would make a fully determined value
// stochastic. The real discovery → registration → note-channel path is covered
// by the standalone live cell
// `tests/live/b0259live-enum-body-unclosed-at-eof-live-cell.test.ts`.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. `msg` asserts its registry row's presence before the
// template is used, and `enumOf` asserts its declaration's presence before its
// variants are read.

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
 * a missing row — the state of `theta/parse/enum-body-unclosed` until the
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
const ENUM_UNCLOSED = "theta/parse/enum-body-unclosed";
/** The empty-prefix row, which keeps an empty variant list ALONE (fence (d)). */
const EMPTY_ENUM = "theta/parse/empty-enum-body";
/** The explicit-value strictness row — co-firing partner (e1). */
const NON_STRING_VALUE = "theta/parse/non-string-enum-value";
/** The name-duplication row — co-firing partner (e2). */
const DUP_VARIANT_NAME = "theta/parse/duplicate-enum-variant-name";
/** The lexical reserved-keyword row — co-firing partner (e3). */
const RESERVED_KEYWORD = "theta/parse/reserved-keyword-as-identifier";
/** Bug 0245's landed row — the `schema` sibling, fenced out of this position. */
const SCHEMA_UNCLOSED = "theta/parse/schema-body-unclosed";
/** Bug 0151's landed row — the `fn` sibling. */
const FN_UNCLOSED = "theta/parse/fn-param-list-unclosed";
/** The lexer's own unrelated line, beside the `fn` row in group (f). */
const SINGLE_LINE_IF = "theta/parse/single-line-if";

// ===========================================================================
// Parse harness — the same shape as tests/schema-body-unclosed-at-eof.test.ts.
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
 * The span of the body's opening `{` in every single-line `enum E { …` fixture
 * below. Line 4 carries the declaration (the frontmatter takes lines 1–3);
 * within `enum E {` the characters are `e`=1 … `m`=4, ` `=5, `E`=6, ` `=7,
 * `{`=8, and the end column is exclusive. The `{` is the range because the
 * subject is the body that was opened and never closed.
 */
const OPEN_BRACE = "4:8-4:9";

/** The same span one line down, for the preceding-statement row (b8). */
const OPEN_BRACE_L5 = "5:8-5:9";

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
 * The single `enum` declaration of `doc`. Presence and uniqueness are asserted
 * before the read, so a row whose declaration vanished reds by naming that
 * rather than by dereferencing `undefined`.
 */
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
 * The captured variant names of the single `enum`, in source order. This is the
 * channel the unclosed body shares with its closed twin, so the prefix
 * retention clause (6) is asserted on it rather than inferred.
 */
function variantsOf(doc: ThetaDocument): readonly string[] {
  return enumOf(doc).variants ?? [];
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

/** The lowered fragment of `E` with the single implicit variant `A`. */
const E_ONE_VARIANT = { E: { type: "string", enum: ["A"] } };

// ===========================================================================
// (R) The DIAG-2 addition itself.
// ===========================================================================

describe("b0259 registry — the new row is a DIAG-2 addition in the fix's own commit", () => {
  it("b0259-R1: code-registry-parse.md carries `theta/parse/enum-body-unclosed` with a placeholder-free Message", () => {
    // DIAG-1 requires every emission to carry a registered code and DIAG-2
    // requires the row to land in the same commit as the site. The *Message* is
    // placeholder-free BY DESIGN: the diagnostic names the variant list, not a
    // binder, so no `<construct>` rendering rule is engaged.
    const template = registryMessage(REGISTRY, ENUM_UNCLOSED) as string | undefined;
    expect(
      template,
      `DIAG-2: the fix adds the ${ENUM_UNCLOSED} row to docs/spec_topics/diagnostics/code-registry-parse.md (and the docs/reference/diagnostics.md mirror) in its own commit`,
    ).toBe("enum variant list is not closed by '}'");
  });

  it("b0259-R2: the new row's Message differs from `theta/parse/schema-body-unclosed`'s — the ground for minting rather than rewording", () => {
    // Adjudication 1. The landed `schema` row's *Message* ("schema object body
    // is not closed by '}'") is FALSE of an enum variant list, and DIAG-4
    // defers a *Message* reword to theta 2.0 — repeated verbatim by
    // source-language-stability.md §Diagnostic-registry carve-out. So the fix
    // MINTS a sibling row instead of widening 0245's, exactly as bug 0245's
    // §Fix adjudication 1 did for `theta/parse/fn-param-list-unclosed`. Both
    // *Messages* are read from the registry; neither is written out here.
    expect(
      msg(SCHEMA_UNCLOSED),
      "the `schema` row's Message names a schema object body, which is false of an enum variant list — clause (1)'s ground for minting a new row",
    ).not.toBe(msg(ENUM_UNCLOSED));
  });
});

// ===========================================================================
// (a) The subject and its closed control, on all three channels.
// ===========================================================================

describe("b0259 (a) — a variant list that reaches EOF after a captured variant is refused", () => {
  it("b0259-a1: `enum E { A,` at EOF reports the unclosed variant list, keeps the variant, and does not register", () => {
    // THE ROOT ROW. At HEAD this is the report's claim in one line: zero
    // diagnostics, `registered=true`, and a lowered `E` the source never
    // finished writing.
    const doc = theta("enum E { A,");
    expect(
      triples(doc),
      `schemas.md §Enum declarations spells the closing \`}\` of every \`enum X { ... }\`; diagnostics=${render(doc)}`,
    ).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4 — the rendered prose is the registry's Message column").toEqual([
      q(ENUM_UNCLOSED, OPEN_BRACE),
    ]);

    // Clause (6): the captured prefix is still returned and the statement is
    // still the ordinary `enum` one, so the emission is the ONLY observable
    // that moves.
    expect(topKinds(doc), "the declaration is still recorded").toEqual(["enum"]);
    expect(variantsOf(doc), `the captured prefix is retained; diagnostics=${render(doc)}`).toEqual([
      "A",
    ]);
    expect(
      lowered(doc),
      "the lowering itself is unchanged — the refusal is what closes the hole",
    ).toEqual(E_ONE_VARIANT);
    expect(
      registered(doc),
      `the E denies registration through the composition root's gate; diagnostics=${render(doc)}`,
    ).toBe(false);
  });

  it("b0259-a2: the closed control `enum E { A }` is untouched on all three channels", () => {
    // The control the subject is currently indistinguishable from. It must stay
    // clean: the trigger is the omitted `}`, and this row has one.
    const doc = theta("enum E { A }");
    expect(
      triples(doc),
      `a closed variant list is the form schemas.md spells; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(variantsOf(doc), "the closed twin's variant").toEqual(["A"]);
    expect(lowered(doc), "the closed twin's lowered artefact").toEqual(E_ONE_VARIANT);
    expect(registered(doc), "a clean load registers").toBe(true);
  });
});

// ===========================================================================
// (b) The class boundary — the omitted `}` is the trigger, not the comma.
// ===========================================================================

describe("b0259 (b) — every shape whose capture stopped before the `}` is refused", () => {
  it("b0259-b1: `enum E { A` (no trailing comma) is refused identically", () => {
    const doc = theta("enum E { A");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "the prefix is retained").toEqual(["A"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0259-b2: `enum E { A, B` — two variants, one emission", () => {
    // One diagnostic per unclosed body, not one per captured variant: the
    // subject is the list, which was opened once.
    const doc = theta("enum E { A, B");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "both variants are retained").toEqual(["A", "B"]);
    expect(lowered(doc), "the retained variants lower as written").toEqual({
      E: { type: "string", enum: ["A", "B"] },
    });
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0259-b3: `enum E { A, B,` — the optional trailing comma changes nothing", () => {
    // schemas.md §Enum declarations makes the trailing comma optional, so it is
    // not the discriminator either way.
    const doc = theta("enum E { A, B,");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "both variants are retained").toEqual(["A", "B"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0259-b4: a trailing newline after the comma is still EOF", () => {
    // The newline inside an open brace group is swallowed as a continuation
    // (grammar.md §Newline continuation), so it moves no boundary: the loop
    // still reaches `atEnd()` between variants.
    const doc = theta("enum E { A,\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "the prefix is retained").toEqual(["A"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it('b0259-b5: `enum E { A, B = "b"` — a COMPLETE explicit value is retained beside the emission', () => {
    // schemas.md §Enum declarations: "Explicit values override that mapping".
    // The value is captured, so the wire value `b` reaches the lowered array —
    // and the body is still unclosed, which is a fault independent of it.
    const doc = theta('enum E { A, B = "b"');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "both variants are retained").toEqual(["A", "B"]);
    expect(enumOf(doc).variantValues, "the explicit wire value is retained").toEqual({ B: "b" });
    expect(lowered(doc), "the explicit value reaches the lowered array").toEqual({
      E: { type: "string", enum: ["A", "b"] },
    });
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0259-b6: `enum E { A, B =` — a HALF-WRITTEN explicit value is refused the same way", () => {
    // The truncation falls after the `=` with no value token, so no wire value
    // binds and the name stands. Still exactly one emission: the missing `}`.
    const doc = theta("enum E { A, B =");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "both names are retained").toEqual(["A", "B"]);
    expect(lowered(doc), "no wire value bound, so the names lower").toEqual({
      E: { type: "string", enum: ["A", "B"] },
    });
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0259-b7: `enum E { A, 42` — a non-identifier token in a name position is skipped, and the body is still unclosed", () => {
    // The loop's skip-anything-else tail consumes the integer without capturing
    // a variant, so the prefix is `["A"]` and no variant-level row fires. The
    // absent `}` is the whole verdict.
    const doc = theta("enum E { A, 42");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "the skipped token captures no variant").toEqual(["A"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0259-b8: a PRECEDING statement does not change the verdict, and the range follows the declaration's line", () => {
    // The declaration is on file line 5 here, so the opening `{` — and the
    // range — move with it. The preceding `let` is untouched.
    const doc = theta("let x = 1\nenum E { A,");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE_L5)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE_L5)]);
    expect(topKinds(doc), "both statements are still recorded").toEqual(["let", "enum"]);
    expect(variantsOf(doc), "the prefix is retained").toEqual(["A"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });
});

// ===========================================================================
// (c) Brace accounting — the no-withhold decision, both directions.
// ===========================================================================

describe("b0259 (c) — the depth counter alone decides, so no withhold is needed", () => {
  it("b0259-c1: `enum E { A, {` — an interior `{` raises the depth and the body is still open", () => {
    // Clause (4). The interior `{` takes depth to 2 and EOF arrives with
    // depth === 2, so the author's body was never closed.
    const doc = theta("enum E { A, {");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "the prefix is retained").toEqual(["A"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0259-c2: `enum E { A, { }` — the `}` the author wrote closed the INTERIOR `{`, leaving depth 1", () => {
    // The row that would need a withhold if the enum loop had a capture that
    // could swallow a closer. It does not: the `}` arm is the only consumer of
    // a `}` punct token and it decremented the interior depth, so the body
    // itself is still unclosed and the emission is correct.
    const doc = theta("enum E { A, { }");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "the prefix is retained").toEqual(["A"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it('b0259-c3: `enum E { A, "}"` — a `}` carried inside a STRING token is not a closer', () => {
    // The `punct`-only depth arms never see a `}` that is a character inside a
    // string token, so the body's closer is still absent and the row fires.
    const doc = theta('enum E { A, "}"');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(quads(doc), "DIAG-4").toEqual([q(ENUM_UNCLOSED, OPEN_BRACE)]);
    expect(variantsOf(doc), "the string token captures no variant").toEqual(["A"]);
    expect(registered(doc), "refused, so not registered").toBe(false);
  });

  it("b0259-c4: the closed twin `enum E { A, { } }` stays CLEAN", () => {
    // The no-withhold decision's tripwire, direction two: a route that fired on
    // a body that IS closed would red here. Depth 1 → 2 → 1 → 0: the loop
    // leaves through the `}` arm.
    const doc = theta("enum E { A, { } }");
    expect(triples(doc), `the body is closed; diagnostics=${render(doc)}`).toEqual([]);
    expect(variantsOf(doc), "the captured variant").toEqual(["A"]);
    expect(lowered(doc), "the closed twin's lowering").toEqual(E_ONE_VARIANT);
    expect(registered(doc), "a clean load registers").toBe(true);
  });

  it('b0259-c5: the closed twin `enum E { A, "}" }` stays CLEAN', () => {
    // The string-borne `}` still spends nothing; the trailing punct `}` is the
    // one that closes the body.
    const doc = theta('enum E { A, "}" }');
    expect(triples(doc), `the body is closed; diagnostics=${render(doc)}`).toEqual([]);
    expect(variantsOf(doc), "the captured variant").toEqual(["A"]);
    expect(lowered(doc), "the closed twin's lowering").toEqual(E_ONE_VARIANT);
    expect(registered(doc), "a clean load registers").toBe(true);
  });

  it("b0259-c6: the closed twin `enum E { A, B = }` stays CLEAN", () => {
    // The half-written explicit value of (b6) with the body closed. The absent
    // value is not this row's subject and draws nothing at HEAD; the `}` is
    // present, so no emission joins it either.
    const doc = theta("enum E { A, B = }");
    expect(triples(doc), `the body is closed; diagnostics=${render(doc)}`).toEqual([]);
    expect(variantsOf(doc), "both names are captured").toEqual(["A", "B"]);
    expect(lowered(doc), "the closed twin's lowering").toEqual({
      E: { type: "string", enum: ["A", "B"] },
    });
    expect(registered(doc), "a clean load registers").toBe(true);
  });
});

// ===========================================================================
// (d) MUST NOT MOVE — the empty-prefix fence (clause (3)).
// ===========================================================================

describe("b0259 (d) — an EMPTY captured prefix keeps `theta/parse/empty-enum-body` ALONE", () => {
  it("b0259-d1: `enum E {`", () => {
    const doc = theta("enum E {");
    expect(
      triples(doc),
      `an empty captured prefix is the empty-enum-body row's own subject; diagnostics=${render(doc)}`,
    ).toEqual([e(EMPTY_ENUM, "4:1-4:9")]);
    expect(quads(doc), "DIAG-4").toEqual([q(EMPTY_ENUM, "4:1-4:9", [["<X>", "E"]])]);
    expect(variantsOf(doc), "no variant derived").toEqual([]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });

  it("b0259-d2: `enum E {\\n` — the trailing newline moves no boundary", () => {
    const doc = theta("enum E {\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(EMPTY_ENUM, "4:1-4:9")]);
    expect(quads(doc), "DIAG-4").toEqual([q(EMPTY_ENUM, "4:1-4:9", [["<X>", "E"]])]);
    expect(variantsOf(doc), "no variant derived").toEqual([]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });

  it("b0259-d3: `enum E { ,` — a separator with no variant before it", () => {
    const doc = theta("enum E { ,");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(EMPTY_ENUM, "4:1-4:11")]);
    expect(quads(doc), "DIAG-4").toEqual([q(EMPTY_ENUM, "4:1-4:11", [["<X>", "E"]])]);
    expect(variantsOf(doc), "no variant derived").toEqual([]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });

  it("b0259-d4: `enum E { {` — an interior `{` before any variant", () => {
    // The depth counter is at 2 and the list is empty: clause (3)'s guard is
    // the captured prefix, not the depth, so this keeps one line.
    const doc = theta("enum E { {");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(EMPTY_ENUM, "4:1-4:11")]);
    expect(quads(doc), "DIAG-4").toEqual([q(EMPTY_ENUM, "4:1-4:11", [["<X>", "E"]])]);
    expect(variantsOf(doc), "no variant derived").toEqual([]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });

  it("b0259-d5: `enum E ` — no body at all", () => {
    // `parseEnumVariants`' advance-to-`{` prelude never finds a `{`, so the
    // emission site is not even reached.
    const doc = theta("enum E ");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(EMPTY_ENUM, "4:1-4:7")]);
    expect(quads(doc), "DIAG-4").toEqual([q(EMPTY_ENUM, "4:1-4:7", [["<X>", "E"]])]);
    expect(variantsOf(doc), "no variant derived").toEqual([]);
    expect(registered(doc), "the existing E already denies registration").toBe(false);
  });
});

// ===========================================================================
// (e) Co-firing — a variant's own fault draws its own row BESIDE the new one.
// ===========================================================================

describe("b0259 (e) — the missing `}` co-fires with every variant-level refusal", () => {
  it("b0259-e1: `enum E { A, B = 42` names BOTH the non-string value and the unclosed list", () => {
    // Clause (5). Two independent faults, so two lines: delete the refused
    // value and the body is still unclosed, so neither verdict is derived from
    // the other. The order is the diagnostic list's own (file, line, col) —
    // `checkEnumDeclaration`'s whole-declaration range starts at column 1, the
    // new row's at the opening `{`.
    const doc = theta("enum E { A, B = 42");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(NON_STRING_VALUE, "4:1-4:19"),
      e(ENUM_UNCLOSED, OPEN_BRACE),
    ]);
    expect(quads(doc), "DIAG-4").toEqual([
      q(NON_STRING_VALUE, "4:1-4:19", [["<kind>", "integer"]]),
      q(ENUM_UNCLOSED, OPEN_BRACE),
    ]);
    expect(variantsOf(doc), "both names are retained").toEqual(["A", "B"]);
    expect(registered(doc), "either E alone would deny registration").toBe(false);
  });

  it("b0259-e2: `enum E { A, A` names BOTH the duplicate variant name and the unclosed list", () => {
    const doc = theta("enum E { A, A");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(DUP_VARIANT_NAME, "4:1-4:14"),
      e(ENUM_UNCLOSED, OPEN_BRACE),
    ]);
    expect(quads(doc), "DIAG-4").toEqual([
      q(DUP_VARIANT_NAME, "4:1-4:14", [
        ["<variant>", "A"],
        ["<enum>", "E"],
      ]),
      q(ENUM_UNCLOSED, OPEN_BRACE),
    ]);
    expect(variantsOf(doc), "the duplicated prefix is retained as written").toEqual(["A", "A"]);
    expect(registered(doc), "either E alone would deny registration").toBe(false);
  });

  it("b0259-e3: `enum E { A, let` names BOTH the reserved keyword and the unclosed list", () => {
    // The keyword row is ranged on the keyword token at column 13, which sorts
    // AFTER the new row's opening `{` at column 8 — so this pairing is the one
    // that pins the new row FIRST in the list, and a route that appended its
    // emission to the end of the diagnostic list rather than letting the shared
    // (file, line, col) sort place it would red here.
    const doc = theta("enum E { A, let");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(ENUM_UNCLOSED, OPEN_BRACE),
      e(RESERVED_KEYWORD, "4:13-4:16"),
    ]);
    expect(quads(doc), "DIAG-4").toEqual([
      q(ENUM_UNCLOSED, OPEN_BRACE),
      q(RESERVED_KEYWORD, "4:13-4:16", [["<keyword>", "let"]]),
    ]);
    expect(variantsOf(doc), "the keyword-spelled variant is retained as written").toEqual([
      "A",
      "let",
    ]);
    expect(registered(doc), "either E alone would deny registration").toBe(false);
  });
});

// ===========================================================================
// (f) Cross-form symmetry — the two sibling declaration forms, unmoved.
// ===========================================================================

describe("b0259 (f) — the `schema` and `fn` siblings keep their own landed rows", () => {
  it("b0259-f1: `schema S { a: string,` at EOF keeps bug 0245's `theta/parse/schema-body-unclosed` ALONE", () => {
    // The mutual exclusivity of the two *Triggers*, asserted from this side:
    // 0245's row keeps the `schema` object body and the new row adds no second
    // line to it. Its range is that body's own opening `{` at column 10.
    const doc = theta("schema S { a: string,");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(SCHEMA_UNCLOSED, "4:10-4:11")]);
    expect(quads(doc), "DIAG-4").toEqual([q(SCHEMA_UNCLOSED, "4:10-4:11")]);
    expect(registered(doc), "the landed E denies registration").toBe(false);
  });

  it("b0259-f2: `fn f(a: string,` at EOF keeps its two codes, unmoved by this fix", () => {
    // Bug 0151's landed row, plus the lexer's own `single-line-if` line, which
    // fires for its own unrelated reason. Neither moves.
    const doc = theta("fn f(a: string,");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(SINGLE_LINE_IF, "4:1-4:3"),
      e(FN_UNCLOSED, "4:5-4:6"),
    ]);
    expect(quads(doc), "DIAG-4 — both messages are the registry's").toEqual([
      q(SINGLE_LINE_IF, "4:1-4:3"),
      q(FN_UNCLOSED, "4:5-4:6"),
    ]);
    expect(registered(doc), "the landed E denies registration").toBe(false);
  });
});
