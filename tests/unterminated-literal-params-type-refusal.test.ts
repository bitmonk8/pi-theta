import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  parseTypeExpression,
  type TypeCheckSite,
} from "../src/parser/type-grammar";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// =====================================================================
// THE CLASS (docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md)
// =====================================================================
// An inline object type whose string literal never closes — `{a as "w\":
// integer}` or the plainer `{a as "w: integer}` — is refused at every one of
// the eight `Type` positions the theta lexer reaches
// (`theta/parse/literal-newline-in-string`, §Reproduction A rows A1–A8) and
// ADMITTED at `params:` with zero diagnostics, lowering the declared field to
// the permissive `{}`. `isSingleEnclosingBraceGroup`
// (src/parser/params.ts) opens a quoted region at `"` and never leaves
// it, so the author's own closing `}` is counted as literal text, the
// predicate returns `false`, and `lowerParamsFieldType`'s inline-object
// intercept is not taken for a source the author wrote as one brace
// group. `lowerTypeExpr` then lowers permissively and pushes the whole text
// into `lowerCtx.unspellable`, where `isUnspellableTextRefusable`
// declines any brace-carrying text, so `parseParams`'s own refusal
// `theta/load/params-type-not-expression` is withheld. A well-formed
// sibling field is deleted with the offending one (§Reproduction B rows B2/B3
// against B8): two sources declaring `b` mint no `b` at all. This file is that
// report's witness.
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (settled round 2, after round 1 measured the
// shared-predicate variant and stopped: narrowing `isUnspellableTextRefusable`
// surfaces at its four other readers and would add a second diagnostic at the
// lexed positions, breaking Constraint 3)
// =====================================================================
// §Fix (b)'s OTHER named arm — "raise `theta/load/params-type-not-expression`
// from the intercept's decline directly" — living in `src/parser/params.ts`
// ALONE:
//   1. `isUnspellableTextRefusable` (src/parser/params.ts) is LEFT
//      UNCHANGED, byte-for-byte: its brace exemption and its four other
//      readers (theta-document.ts:7069, :7536, type-layer-checks.ts:1148) are
//      untouched, so narrowing it never happens and Constraint 3 holds by
//      construction rather than by a second predicate branch.
//   2. A new, INDEPENDENT quote/escape-aware predicate,
//      `hasUnterminatedStringLiteral` (src/parser/params.ts), answers
//      "does this text carry a string literal that never closes" over the
//      field's WHOLE type-half source text — not the `unspellable` sink — so it
//      reaches the nested (`{q: {a as "w: integer}}`) and generic
//      (`array<{a as "w: integer}>`) spellings the sink never collects.
//   3. `parseParams`'s per-field loop (`params.ts`) raises that position's
//      OWN registered row, `theta/load/params-type-not-expression`
//      (src/parser/params.ts), directly off this new predicate — the
//      intercept's decline, made loud — Message unchanged (DIAG-4). No new
//      registry row is minted and no lex-phase row is moved into a load-time
//      position.
// Disposition of §Reproduction (D), stated by this route: the interior's four
// raw-key rows and the identifier rules stay WITHHELD for a refused source —
// one diagnostic per field. The direct `parseTypeExpression` cells D1–D8 are
// therefore UNCHANGED by this route and are asserted at their HEAD values.
// The type tokeniser (src/parser/type-grammar.ts:226) is NOT touched, so the
// eight lexed positions keep their exact ordered code sequences (Constraint 3,
// group (A) below).
//
// THE BOUNDARY THIS FILE MUST NOT MOVE (Constraint 2, normative):
//   §Reproduction (E) row E2 — `{a: integer`, an UNCLOSED BRACE with no
//   unterminated literal — stays ADMITTED with `[]` diagnostics and the
//   permissive `{}` lowering. That spelling is named normatively as admitted
//   at docs/spec_topics/frontmatter/frontmatter-fields-a.md:58 and
//   docs/spec_topics/diagnostics/code-registry-load.md:19. Any test that flips
//   E2 is wrong; group (E) pins it explicitly, and it is green at HEAD and
//   after.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/lexical.md:26 — a string literal is "**Single-line
//     only**" and must close: a literal newline inside one is
//     `theta/parse/literal-newline-in-string`, EOF inside one is
//     `theta/parse/unterminated-string`. Text carrying an unterminated literal
//     therefore derives from no production of the type grammar.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:58 — a `params:`
//     field's right-hand side is "a type expression parsed by the theta type
//     grammar — the same grammar used in every other type-annotation
//     position", which is why row A9 must answer as rows A1–A8 do; and the
//     brace exemption whose named subject (E2) does not move.
//   - docs/spec_topics/grammar.md:109 — an inline object's fields carry
//     object-schema field semantics and each is required by default.
//   - docs/spec_topics/schema-subset.md:78 — an object lowers to `properties`
//     over the wire names with `required` carrying every one of them, so no
//     admissible outcome silently drops a field the author declared.
//   - docs/spec_topics/diagnostics/code-registry-load.md:19 —
//     `theta/load/params-type-not-expression`, the row this route reuses.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:13
//     (`literal-newline-in-string`), :98–:101 (the four raw-key rows whose
//     closing-`}` gate keeps them withheld under this route).
//   - DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md:72) — the
//     registry is closed; this route mints no row, so every expectation below
//     names a row that already ships.
//   - DIAG-4 (:74) — the *Message* column is normative; every expected message
//     here is read out of the registry through `registryMessage`, none is
//     copied as prose.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles
// inside one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39, the shipped load path behind the inert offline
// `parseDeps` double) or one direct `parseTypeExpression` call
// (src/parser/type-grammar.ts:226). An integration or live tier reaches no
// observable this tier cannot: the defect is a character scan over a string,
// and the artefact it corrupts is returned by value on the document.
//
// WHAT IS RED AT HEAD (v0.183.0), measured before this file was written:
// group (A)'s two `params:` cells (U1 and U2 at row A9) report `[]` where the
// refusal is owed and lower the permissive `{}`; group (B)'s cells B1–B7
// report `[]` and mint a lowered schema. CONTROLS, green at HEAD and after:
// every lexed cell of group (A) (A1–A8, all three columns) and the CTL column
// of row A9, group (B)'s B8 and B9, every cell of group (D), and both cells of
// group (E).
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. The
// registry lookup asserts each row's presence and its placeholder before any
// template is used, so a missing or reworded row reds by naming the registry;
// every diagnostic cell asserts the whole UNFILTERED ordered `doc.diagnostics`
// list, so a missing emission can never read as a pass.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
  readonly namespace: string;
  readonly phase: string;
}

const DIAGNOSTICS_DIR = "../docs/spec_topics/diagnostics/";

function readDiagnosticsPage(page: string): string {
  return readFileSync(fileURLToPath(new URL(`${DIAGNOSTICS_DIR}${page}`, import.meta.url)), "utf8");
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map(readDiagnosticsPage)
    .join("\n"),
) as RegistryRow[];

/** The `params:` position's own registered refusal — the code this route raises. */
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";
/** The lexer's arm the eight lexed positions take for this class. */
const NEWLINE_IN_STRING = "theta/parse/literal-newline-in-string";
/** The row the CTL spelling draws, unmoved by this route (bugs 0160 / 0229). */
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
/** Recovery diagnostics that sit beside the lexer's arm at two positions. */
const LET_NO_INIT = "theta/parse/let-without-initialiser";
const FN_PARAMS_UNCLOSED = "theta/parse/fn-param-list-unclosed";
/** The interior rows group (D) measures as WITHHELD under this route. */
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const EMPTY_SCHEMA_BODY = "theta/parse/empty-schema-body";
/** bug 0245's row — fires beside the A3 U1/U2 lexer arm below (see `positionRows`). */
const SCHEMA_BODY_UNCLOSED = "theta/parse/schema-body-unclosed";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
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

/** One rendered diagnostic, in the shape `diagLines` produces. */
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}

/** The refusal this route raises at `params:`, naming the field (`<param>`). */
function REFUSED(param: string): Exp {
  return { severity: "error", code: PARAMS_NOT_EXPR, fills: [["<param>", param]] };
}
function NEWLINE(): Exp {
  return { severity: "error", code: NEWLINE_IN_STRING, fills: [] };
}
function REN(field: string): Exp {
  return { severity: "error", code: RENAMED_INLINE, fills: [["<field>", field]] };
}
function LETNOINIT(name: string): Exp {
  return { severity: "error", code: LET_NO_INIT, fills: [["<name>", name]] };
}
function FNUNCLOSED(): Exp {
  return { severity: "error", code: FN_PARAMS_UNCLOSED, fills: [] };
}
function UNCLOSED(): Exp {
  return { severity: "error", code: SCHEMA_BODY_UNCLOSED, fills: [] };
}

// ===========================================================================
// Fixtures, in the vocabulary of the landed sibling witnesses
// (tests/escaped-quote-inline-field-name-refusal.test.ts). Every body fixture
// ends `let a = 1` + `a`, and every fixture carries `mode: prompt`.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/**
 * A `mode: prompt` theta whose `params:` field `p` carries `type` as a
 * SINGLE-quoted YAML scalar, so the interior double quote and any backslash
 * reach the theta type grammar intact — the spelling §Reproduction measures.
 */
function paramsSrc(type: string): string {
  return `---\nmode: prompt\nparams:\n  p: '${type}'\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — the position whose lowering IS the document root. */
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

/** U1 — 0229 residual 1's spelling: the wire-name literal never closes. */
const U1 = '{a as "w\\": integer}';
/** U2 — the plainer spelling of the same class. */
const U2 = '{a as "w: integer}';
/** CTL — the escaped spelling bug 0229 closed; refused on different grounds. */
const CTL = '{a as "w\\"x": integer}';

// ===========================================================================
// Parse + assertion helpers.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "bug0232.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

/** The lowered `params:` schema as a consumer reads it off the document. */
function paramsLoweredSchema(type: string): unknown {
  const fm = parseDoc(paramsSrc(type), "bug0232.theta").frontmatter as
    | { readonly params?: { readonly loweredSchema?: unknown } | null }
    | null;
  if (fm === null) {
    return null;
  }
  return fm.params?.loweredSchema ?? null;
}

interface Cell {
  readonly cell: string;
  readonly src: string;
  readonly path?: string;
  readonly expected: readonly Exp[];
}

/**
 * One group's cells asserted as a whole-map equality: separate assertions stop
 * at the first divergence and hide the rest, and the position-invariance claim
 * is only meaningful against every cell at once.
 */
function expectGroup(cells: readonly Cell[], why: string): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const c of cells) {
    // The cell LABEL alone is the key: a fixture source is multi-line, and a
    // multi-line key turns vitest's whole-map diff into an unreadable wall.
    // Uniqueness of the labels is asserted in group (F).
    actual[c.cell] = lines(c.src, c.path);
    expected[c.cell] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}

// ===========================================================================
// (A) §Reproduction (A) — the nine positions. A1–A8 are the eight positions
// the theta lexer reaches and are asserted UNCHANGED (Constraint 3: each row's
// ordered code sequence is exactly what it is at HEAD, including the recovery
// diagnostic that precedes the lexer's arm at A2, A4 and A8). A9 is the claim:
// `params:` must refuse with its own registered row and withhold the lowering.
// ===========================================================================

/** The eight lexed positions plus the `params:` ninth, for one type source. */
function positionCells(
  label: string,
  type: string,
  lexed: readonly Exp[],
  lexedWithLet: readonly Exp[],
  lexedWithFn: readonly Exp[],
  params: readonly Exp[],
): Cell[] {
  return [
    { cell: `A1 ${label} query annotation`, src: annotSrc(type), expected: lexed },
    { cell: `A2 ${label} let annotation`, src: body(`let x: ${type} = 1`), expected: lexedWithLet },
    { cell: `A3 ${label} schema body field`, src: body(`schema S { p: ${type} }`), expected: lexed },
    { cell: `A4 ${label} fn parameter`, src: body(`fn f(p: ${type}) { 1 }`), expected: lexedWithFn },
    { cell: `A5 ${label} fn return`, src: body(`fn f(): ${type} { 1 }`), expected: lexed },
    { cell: `A6 ${label} nested body`, src: annotSrc(`{q: ${type}}`), expected: lexed },
    {
      cell: `A7 ${label} generic argument`,
      src: annotSrc(`array<${type}>`),
      // RE-PINNED for bug 0233
      // (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md):
      // the four raw-key rows' shared generic-argument gate is gone from
      // `walkType`'s raw-key loop, so the CTL column now draws the same
      // rename refusal `lexed` names for it at every other position, while
      // the unterminated columns still draw the lexer's arm, which fires
      // before any parse-time rule and is unmoved.
      expected: lexed,
    },
    {
      cell: `A8 ${label} .thetalib fn parameter`,
      src: `fn f(p: ${type}) { 1 }\n`,
      path: "bug0232.thetalib",
      expected: label === "CTL" ? lexed : lexedWithFn,
    },
    { cell: `A9 ${label} params: field`, src: paramsSrc(type), expected: params },
  ];
}

function unterminatedPositionCells(label: string, type: string): Cell[] {
  return positionCells(
    label,
    type,
    [NEWLINE()],
    [LETNOINIT("x"), NEWLINE()],
    [FNUNCLOSED(), NEWLINE()],
    // THE CLAIM: `params:` is the only measured position where the text
    // reaches a lowering without first reaching a lexer, and it must refuse
    // with the row it already owns (code-registry-load.md:19). `[]` here is
    // the defect: a declared one-field contract replaced by "any JSON".
    [REFUSED("p")],
  );
}

function controlPositionCells(): Cell[] {
  return positionCells("CTL", CTL, [REN("a")], [REN("a")], [REN("a")], [REN("a")]);
}

function positionRows(): Cell[] {
  const cells = [
    ...unterminatedPositionCells("U1", U1),
    ...unterminatedPositionCells("U2", U2),
    ...controlPositionCells(),
  ];
  // A3 U1/U2 (`schema S { p: ${type} }`) spells only the INNER unterminated
  // literal's own escape trouble — the run-on string swallows the OUTER
  // schema body's own closing `}` too (visible in the field's retained
  // `typeSource`, src/parser/theta-document.ts), so the declaration reaches
  // EOF unclosed and bug 0245's row fires FIRST, ahead of the lexer's own
  // `literal-newline-in-string`. The A3 CTL row (a properly-escaped literal)
  // keeps its own `}` and is unmoved; this is a fault of U1/U2's OWN unescaped
  // spelling, not a widening of what this route touches.
  return cells.map((c) =>
    c.cell === "A3 U1 schema body field" || c.cell === "A3 U2 schema body field"
      ? { ...c, expected: [UNCLOSED(), ...c.expected] }
      : c,
  );
}

describe("bug 0232 (A) — the ninth position answers as the eight lexed ones do", () => {
  it("RED: the eight lexed positions unchanged, `params:` refused", () => {
    expectGroup(
      positionRows(),
      "A — lexical.md:26 makes a string literal single-line and requires it to close, so text " +
        "carrying an unterminated literal derives from no `Type` production at any position, and " +
        "frontmatter-fields-a.md:58 parses the `params:` type half with the same grammar as " +
        "every other annotation position. A red on an A9 U1/U2 cell showing `[]` IS bug 0232. A " +
        "red on any A1–A8 cell, or on any CTL cell, is Constraint 3 violated — this route touches " +
        "src/parser/params.ts alone and must move none of them",
    );
  });
});

// ===========================================================================
// (B) §Reproduction (B) — the lowering cells. B2 and B3 against B8 are the
// field-loss claim: two sources that declare `b` and one that declares `b`
// alone, and at HEAD only the last mints it. Under this route B1–B7 are
// refused, so no lowered schema is minted for them at all; B8 and B9 are
// asserted UNCHANGED.
// ===========================================================================

interface LowerCell {
  readonly cell: string;
  readonly type: string;
  readonly expected: readonly Exp[];
  readonly loweredSchema: unknown;
}

/** The `$defs` name `{b: integer}` alone mints — unmoved by this route. */
const B_ONLY_SLUG = "__inline_8cc8cb1e7074a3af";

/** B8's whole lowered schema, byte-for-byte as HEAD mints it. */
const B8_SCHEMA = {
  type: "object",
  properties: { p: { $ref: `#/$defs/${B_ONLY_SLUG}` } },
  required: ["p"],
  additionalProperties: false,
  $defs: {
    [B_ONLY_SLUG]: {
      type: "object",
      properties: { b: { type: "integer" } },
      required: ["b"],
      additionalProperties: false,
    },
  },
} as const;

function loweringCells(): LowerCell[] {
  return [
    { cell: "B1 escaped-quote unterminated", type: U1, expected: [REFUSED("p")], loweredSchema: null },
    {
      cell: "B2 unterminated first, well-formed sibling second",
      type: '{a as "w: integer, b: integer}',
      expected: [REFUSED("p")],
      loweredSchema: null,
    },
    {
      cell: "B3 well-formed sibling first, unterminated second",
      type: '{b: integer, a as "w: integer}',
      expected: [REFUSED("p")],
      loweredSchema: null,
    },
    {
      cell: "B4 quote-led key, unterminated",
      type: '{"w: integer}',
      expected: [REFUSED("p")],
      loweredSchema: null,
    },
    {
      // Written YAML-doubled (`''`) so the single interior `'` survives the
      // single-quoted scalar and reaches the type grammar as `{a as 'w: integer}`.
      cell: "B5 single-quoted unterminated",
      type: "{a as ''w: integer}",
      expected: [REFUSED("p")],
      loweredSchema: null,
    },
    {
      cell: "B6 nested inside an inline object field",
      type: '{q: {a as "w: integer}}',
      expected: [REFUSED("p")],
      loweredSchema: null,
    },
    {
      // B7 IS THE ONE CELL THE DOC DOES NOT SETTLE POST-FIX. At HEAD it lowers
      // to `{"type":"array","items":{}}` rather than the flat permissive `{}`,
      // because the unterminated literal sits one level down inside a generic
      // argument, so the refusal has to reach the argument's own text for this
      // row to move. This is the cell the implementer MEASURES: if the settled
      // route cannot reach it, it is a recorded bound to be adjudicated, not a
      // licence to weaken the eight cells above it.
      cell: "B7 unterminated inside a generic argument",
      type: 'array<{a as "w: integer}>',
      expected: [REFUSED("p")],
      loweredSchema: null,
    },
    {
      cell: "B8 control, well-formed one-field inline object",
      type: "{b: integer}",
      expected: [],
      loweredSchema: B8_SCHEMA,
    },
    {
      cell: "B9 control, the escaped spelling bug 0229 refuses",
      type: CTL,
      expected: [REN("a")],
      loweredSchema: null,
    },
  ];
}

describe("bug 0232 (B) — no field the author declared is lost without a diagnostic", () => {
  it("RED: the nine `params:` lowering cells, diagnostics and lowered bytes", () => {
    const actual: Record<string, { diagnostics: string[]; loweredSchema: unknown }> = {};
    const expected: Record<string, { diagnostics: string[]; loweredSchema: unknown }> = {};
    for (const c of loweringCells()) {
      const key = `${c.cell} :: ${c.type}`;
      actual[key] = {
        diagnostics: lines(paramsSrc(c.type)),
        loweredSchema: paramsLoweredSchema(c.type),
      };
      expected[key] = { diagnostics: renderAll(c.expected), loweredSchema: c.loweredSchema };
    }
    expect(
      actual,
      "B — schema-subset.md:78 lowers an object to `properties` over the wire names with " +
        "`required` carrying every one of them, and grammar.md:109 makes each inline field " +
        "required by default, so no admissible outcome is `[]` plus a permissive `{}`. B2 and B3 " +
        "against B8 are the field-loss claim: two sources declaring `b` must not mint nothing " +
        "where the source declaring `b` alone mints a `$ref` carrying it. A red on B8 or B9 is " +
        "an over-reach — this route must refuse the unterminated spellings and only those",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (D) §Reproduction (D) — the interior's own rules, at the direct
// `parseTypeExpression` seam `parseParams` runs (src/parser/params.ts). This
// route's STATED disposition is that they stay WITHHELD for a refused source —
// one diagnostic per field — so every cell here is asserted UNCHANGED and must
// be green at HEAD and after. A red here means the route drifted into the type
// grammar, which it does not touch.
// ===========================================================================

const SEAM_RANGE: SourceRange = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 },
};
const SEAM_SITE: TypeCheckSite = { file: "bug0232.theta", range: SEAM_RANGE };

function seamCodes(source: string): string[] {
  return parseTypeExpression(source, "schema-feeding", SEAM_SITE).map((d) => d.code);
}

describe("bug 0232 (D) — the interior rows stay withheld for a refused source", () => {
  it("CONTROL: the eight direct type-expression cells, unchanged by this route", () => {
    expect(
      {
        D1: seamCodes("{x: integer, x: integer}"),
        D2: seamCodes('{x: integer, x: integer, y as "w: integer}'),
        D3: seamCodes('{"q": integer}'),
        D4: seamCodes('{"q": integer, y as "w: integer}'),
        D5: seamCodes("{X: integer}"),
        D6: seamCodes('{X: integer, y as "w: integer}'),
        D7: seamCodes("{}"),
        D8: seamCodes('{a as "w: integer}'),
      },
      "D — the four raw-key rows (code-registry-parse.md:98–:101) and the identifier rules gate " +
        "on a spelled closing `}`; an unterminated literal swallows it, so D2, D4, D6 and D8 " +
        "draw nothing. The settled route leaves that alone — one diagnostic per field, raised at " +
        "the `params:` position — so these eight cells are UNCHANGED law, not the claim",
    ).toEqual({
      D1: [DUPLICATE_INLINE],
      D2: [],
      D3: [QUOTED_INLINE],
      D4: [],
      D5: [BINDING_CASE],
      D6: [],
      D7: [EMPTY_SCHEMA_BODY],
      D8: [],
    });
  });
});

// ===========================================================================
// (E) §Reproduction (E) — the boundary. E1 shows the text stage works at this
// position at all; E2 is Constraint 2's normatively-named subject and is
// asserted UNCHANGED. Both are green at HEAD and must stay green.
// ===========================================================================

/** The permissive lowering the brace exemption's named subject keeps. */
const PERMISSIVE_P = {
  type: "object",
  properties: { p: {} },
  required: ["p"],
  additionalProperties: false,
} as const;

describe("bug 0232 (E) — the brace exemption's named subject does not move", () => {
  it("CONTROL: `???` refused, `{a: integer` still admitted and permissive", () => {
    expect(
      {
        E1: { diagnostics: lines(paramsSrc("???")), loweredSchema: paramsLoweredSchema("???") },
        E2: {
          diagnostics: lines(paramsSrc("{a: integer")),
          loweredSchema: paramsLoweredSchema("{a: integer"),
        },
      },
      "E — E1 proves the text stage is reachable at `params:`, so a withheld refusal on the " +
        "unterminated spellings is a predicate decline and not a missing seam. E2 is the " +
        "BOUNDARY: `{a: integer` is a genuinely unbalanced brace group with no unterminated " +
        "literal, named normatively as admitted with a permissive lowering at " +
        "frontmatter-fields-a.md:58 and code-registry-load.md:19. A red on E2 means " +
        "`hasUnterminatedStringLiteral` (src/parser/params.ts) flagged a brace-only " +
        "imbalance rather than an unterminated literal, which Constraint 2 forbids without " +
        "editing both prose sites in the same commit",
    ).toEqual({
      E1: { diagnostics: renderAll([REFUSED("p")]), loweredSchema: null },
      E2: { diagnostics: [], loweredSchema: PERMISSIVE_P },
    });
  });
});

// ===========================================================================
// (F) THE INVENTORY ITSELF — anti-vacuity.
// ===========================================================================

/** Declared inventory sizes — the cell below recomputes them. */
const POSITION_CELLS = 27;
const REFUSAL_CELLS = 9;

describe("bug 0232 (F) — the inventory is counted", () => {
  it("CONTROL: 27 position cells, 9 of which expect the params: refusal", () => {
    const cells = positionRows();
    expect(
      cells.length,
      "F — three columns (U1, U2, CTL) over nine positions. A cell deleted or a column dropped " +
        "moves this count, so the file cannot shrink unnoticed",
    ).toBe(POSITION_CELLS);
    expect(
      [...cells, ...loweringCells().map((c) => ({ cell: c.cell, expected: c.expected }))].filter(
        (c) => c.expected.some((e) => e.code === PARAMS_NOT_EXPR),
      ).length,
      `F — the declared count of cells naming ${PARAMS_NOT_EXPR} across groups (A) and (B): two ` +
        "A9 cells plus B1–B7. A cell weakened to `[]` to buy green would move this count, which " +
        "is what makes the red set non-vacuous",
    ).toBe(REFUSAL_CELLS);
    expect(
      new Set(cells.map((c) => c.cell)).size,
      "F — every cell key is distinct, so no whole-map equality silently drops a row",
    ).toBe(cells.length);
  });
});
