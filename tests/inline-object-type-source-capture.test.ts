import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { lowerParamsFieldType, type LowerCtx } from "../src/parser/params";
import type {
  InvokeExpr,
  LetStmt,
  QueryExpr,
  ThetaDocument,
} from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0228 — the three type-source captures in `src/parser/theta-document.ts`
// rebuild a `Type`'s text by joining lexer token texts with NO separator
// (`parseType`'s `return parts.join("")` at :3554, fed an inline object's tokens
// by `consumeInlineObjectType` at :3562; the `invoke<T>` capture's
// `parts.join("").trim()` at :4924; the `@<T>` capture's `parts.join("").trim()`
// at :5085, under the comment at :5068 that calls the result "captured verbatim
// as the annotation"). At every `Type` position except `params:` — which hands
// its YAML scalar to `parseTypeExpression` verbatim, in `parseParams`
// (`src/parser/params.ts`)
// — an inline object's interior therefore loses the author's inter-token
// whitespace before any rule or lowerer sees it: `{a b: integer}` arrives as
// `{ab:integer}` and loads with zero diagnostics, minting the wire property name
// `ab` that no author wrote, while the same text at `params:` mints `a b`
// (docs/bugs/0228-inline-object-type-source-token-join-corrupts-field-keys.md).
// This file is that report's §Fix (e) witness.
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (settled by parent adjudication before it was
// written; the premeasurement is `.pi/tmp/fixes/0228-report.md`)
// =====================================================================
// §Fix (a) route 1, in the SUBJECT-SCOPED reading the premeasurement calls
// VARIANT B — a raw-source slice of the balanced brace GROUP only:
//
//   1. `consumeInlineObjectType` (src/parser/theta-document.ts:3562) still walks
//      the balanced `{ … }` group token by token, but pushes ONE part — the raw
//      `this.bodyText` slice of the group via `positionToOffset` — with the
//      joined token texts as the fallback. The same consumer is reached from
//      `parseType` at depth > 0, from `parseQuery`'s `@<T>` loop (:5085) and
//      from `parseInvoke`'s `invoke<T>` loop (:4924). Text OUTSIDE a brace group
//      keeps today's separator-free join, so `Cat+` and `integer--` — the judged
//      text of the landed 0061 / 0124 / 0203 refusals — are byte-unchanged. That
//      is why this file asserts brace-group interiors ONLY.
//   2. A GHOST BOUND at the three angle-context call sites: the brace consumer
//      also stops, WITHOUT consuming, at a `>` met at its own angle-depth 0
//      while the brace group is still unclosed. Group (G) is that bound's
//      witness — without it the consumer runs past the annotation's closing `>`
//      and swallows the backtick template (the premeasurement's Residual 3).
//   3. §Fix (b) is answered with a NEW inline row rather than by widening the
//      four `*-type-not-expression` rows, because the offending text DOES derive
//      from a `Type` at ten positions today only by accident of the join: with
//      the author's spacing restored, `{a b: integer}` still parses as an
//      `ObjectType` whose field name is not an `Ident`, and the position's own
//      `*-type-not-expression` row is about the TYPE not deriving from a `Type`
//      production (row E3 of §Reproduction (e), which this file pins UNMOVED).
//
// THE NEW REGISTRY ROW (E, parse):
//   code    `theta/parse/inline-field-name-not-identifier`
//   Message `field name '<field>' within one inline object type is not an identifier`
// Detection site: `walkType`'s object arm raw-key loop, gated on
// `node.closingBraceSpelled` alone (bug 0233 dropped the loop's other,
// narrower `!insideGenericArgument` half, so all four raw-key rows now
// answer alike at every depth beneath a generic argument). PRECEDENCE —
// fourth and last:
//   1. a REPEATING key is `theta/parse/duplicate-inline-field-name`'s alone (:1024);
//   2. a QUOTE-LED key is `theta/parse/quoted-inline-field-name`'s alone (:1042);
//   3. a RENAME-shaped key is `theta/parse/renamed-inline-field-name`'s alone (:1079);
//   4. only then this row — a non-repeating, non-quote-led, non-rename key whose
//      raw text is not `[A-Za-z_][A-Za-z0-9_]*` (`docs/spec_topics/lexical.md:13`).
// ONE diagnostic per offending field, and a field this row refuses draws NO
// other error row on the same field (bug 0129's count-consequence law). The
// gate is inherited byte-for-byte from the three neighbours: `node.closingBraceSpelled`.
// `<field>` renders the RAW key, so the row takes a THIRD row-scoped carve-out
// on docs/spec_topics/diagnostics/placeholder-rendering-b.md §"Source-derived
// placeholders" (:10, whose sentence widens from "every row but two" to three).
// Cell A1 makes that a falsifiable claim about the page.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/type-system.md:15 — ONE type grammar in every
//     type-annotation position, and text deriving from none of its forms "is
//     refused at load or parse time rather than admitted as a nominal
//     reference". Groups (C), (E) and (F) are that claim made falsifiable
//     across all eleven positions.
//   - docs/spec_topics/grammar.md:101 — `ObjectType ::= "{" Field ("," Field)*
//     ","? "}"`, `Field` per Schema Declarations; :109 — the four inline rules
//     are stated over "the entries the body spells between its top-level
//     commas, on the text before each entry's own top-level colon, taken as
//     written". "As written" is the author's text, not a reconstruction of it —
//     which is group (B)'s whole subject.
//   - docs/spec_topics/schemas.md:17 — "Field names are identifiers".
//   - docs/spec_topics/lexical.md:13 — `Ident` is `[A-Za-z_][A-Za-z0-9_]*`,
//     which admits no space: two identifiers separated by a space in a
//     field-name position derive from no `Field`.
//   - docs/spec_topics/schema-subset.md:78 — `properties` and `required` are
//     keyed by WIRE NAMES; neither `ab` (ten positions) nor `a b` (`params:`)
//     is one. Group (D) is that pair of artefacts.
//   - DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md:72) — the
//     registry is closed, so the row and the emission land in one commit. Cell
//     A0 is that obligation made falsifiable.
//   - DIAG-4 (:74) — the *Message* column is normative and tests MUST source it
//     from the registry. Every expected message below is read out of
//     docs/spec_topics/diagnostics/ through `registryMessage`; no message prose
//     is copied.
//   - docs/spec_topics/governance/source-language-stability.md — the
//     diagnostic-registry carve-out dispositions the newly-refused set (groups
//     (C), (D), (E), (H)); the newly-ADMITTED set (the fabricated
//     `duplicate-inline-field-name` of §Reproduction (b) and the fabricated
//     `binding-case-mismatch` of §Reproduction (d), both of which STOP firing)
//     is stated explicitly by those same groups' expectations.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts this kind of claim in, and the tier above it would add nothing: every
// claim settles inside one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39, the shipped load path behind the standard inert
// `parseDeps` double), one AST read-back, or one direct lowerer call
// (`lowerQueryResponseSchema`, src/runtime/query-schema-lowering.ts:153 — the
// same call `src/extension/production-theta-producer.ts:2672` makes on
// `QueryExpr.schema`; `lowerParamsFieldType`, src/parser/params.ts). The two
// live halves cover only the registration-facing surface this tier cannot
// reach: tests/live/inline-field-name-not-identifier-CELL-A-live-cell.test.ts
// (H8a) and
// tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts
// (H9a).
//
// WHAT IS RED AT HEAD, derived from the premeasurement before it was measured
// here, and each red naming exactly ONE of the report's three symptoms:
//   * SYMPTOM 1 — THE JOINED CAPTURE. Group (B) (every capture row A1–A10 at all
//     three capture sites), group (D)'s captured-text and lowered-key rows, and
//     group (G)'s `@<{a: array<x>}>` / `array<{a b: integer}>` capture rows.
//   * SYMPTOM 2 — THE FABRICATED VERDICT. Group (C) (the fabricated
//     `duplicate-inline-field-name 'ab'` at ten positions and the silence at
//     `params:`), group (E) (the fabricated `binding-case-mismatch` at ten
//     positions, including the generic-argument position 0154's pass never
//     carved out), and group (H) (`{let b: integer}` loading silently at every
//     position).
//   * SYMPTOM 3 — THE MISSING REGISTRY ROW. Cell A0, cell A1, and every
//     message-level expectation that fills the new row's template (DIAG-4
//     forbids copying the prose, so those cells red inside `msg()` naming the
//     registry until the row lands — which is the correct pre-fix red).
// GREEN NOW AND AFTER (the no-move controls): group (F)'s E1/E2 lowered bytes
// and their empty diagnostic lists, E3's whole position map, group (G)'s
// `@<Ghost{>` ghost bound, and group (I)'s inventory arithmetic (its counts
// re-derived below). Bug 0233
// (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md)
// RE-PINS the generic-argument cells of groups (C), (E), (F)'s E4/E5 and (G)'s
// G3 from silent to refused, since it removes the gate those cells' rows
// inherited from this file's own fix; every non-generic-argument cell in this
// file is unmoved by it.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. The
// registry lookup asserts its row's presence and its placeholder before any
// template is used, so a missing or reworded row reds by NAMING the registry;
// every diagnostic cell asserts its whole UNFILTERED ordered list, so an absent
// emission can never read as a pass; and the whole inventory is asserted a
// second time at CODE level with no registry dependency at all (cell I2), so
// the wrong-verdict half of the fix is witnessed even while the registry half is
// outstanding.
//
// ANTI-VACUITY: cell I1 recomputes the inventory's size and the number of cells
// carrying the new row from the inventory itself, so no cell can be quietly
// weakened to `[]` and no group can shrink unnoticed.

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

/** The new row §Fix (b) mints: a raw inline field-name key that is no `Ident`. */
const NOT_IDENT = "theta/parse/inline-field-name-not-identifier";
/** The three rows this one is subordinate to (code-registry-parse.md:98–:100). */
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
/** The two rows whose fabricated emissions this fix REMOVES. */
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const RESERVED_KEYWORD = "theta/parse/reserved-keyword-as-identifier";
/** The four `*-type-not-expression` rows §Fix (b) declines to widen. */
const ANNOT_NOT_EXPR = "theta/parse/annotation-type-not-expression";
const SCHEMA_NOT_EXPR = "theta/parse/schema-type-not-expression";
const QUERY_NOT_EXPR = "theta/parse/query-annotation-type-not-expression";
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";
/** Drawn by group (G)'s `array<x>` bound only. */
const UNRESOLVED_NAMED = "theta/parse/unresolved-named-type";

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

function codesOf(exps: readonly Exp[]): string[] {
  return exps.map((e) => e.code);
}

/**
 * The new row's rendering. `field` is the RAW pre-colon key, taken verbatim
 * after `trim()` — the same comparison key its three neighbours share — which
 * is why this row needs the third row-scoped `<field>` carve-out cell A1
 * asserts.
 */
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
}
function DUP(key: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", key]] };
}
function QUOTED(key: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", key]] };
}
function ANNOTNOTEXPR(name: string): Exp {
  return { severity: "error", code: ANNOT_NOT_EXPR, fills: [["<name>", name]] };
}
function SCHEMANOTEXPR(subject: string): Exp {
  return { severity: "error", code: SCHEMA_NOT_EXPR, fills: [["<X>", subject]] };
}
function QUERYNOTEXPR(): Exp {
  return { severity: "error", code: QUERY_NOT_EXPR, fills: [] };
}
function PARAMSNOTEXPR(param: string): Exp {
  return { severity: "error", code: PARAMS_NOT_EXPR, fills: [["<param>", param]] };
}
function UNRESOLVED(name: string): Exp {
  return { severity: "error", code: UNRESOLVED_NAMED, fills: [["<name>", name]] };
}

// ===========================================================================
// Fixtures. One builder per `Type` position, in the vocabulary of the landed
// siblings (tests/inline-object-wire-name-rename-refusal.test.ts,
// tests/inline-object-field-name-comparison-key.test.ts). Every body fixture
// ends `let a = 1` + `a` so the theta carries a tail expression, and every
// fixture carries `mode: prompt` so no `theta/load/missing-mode` noise is
// present. The `.thetalib` row carries no frontmatter at all.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/**
 * A `mode: prompt` theta whose `params:` block is `block`. The type is written
 * as a SINGLE-quoted YAML scalar so an interior DOUBLE quote (rows A9, E2, E4)
 * reaches the theta type grammar intact.
 */
function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation with a backtick body — the second capture site. */
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

/**
 * The ELEVEN `Type` positions of §Reproduction (b) rows B1–B11, plus the
 * generic-argument carve-out position as a twelfth labelled row.
 *
 * The three initialiser-bearing positions are spelled `T | null = null` rather
 * than `T = 1`: an `integer` initialiser under a conforming-free annotation
 * draws `theta/parse/let-rhs-type-mismatch`, whose *Message* renders the
 * annotation text and would therefore make every cell in this file a second,
 * incidental witness of the capture. The subject here is the field-name key, so
 * the initialiser is chosen to conform (the same repair bug 0154's and bug
 * 0160's live fixtures make for the identical hazard).
 */
function positionSources(type: string): ReadonlyArray<readonly [string, string, string]> {
  return [
    ["let annotation", body(`let x: ${type} | null = null`), "bug0228.theta"],
    ["let mut annotation", body(`let mut x: ${type} | null = null`), "bug0228.theta"],
    ["fn parameter", body(`fn f(p: ${type}) { 1 }`), "bug0228.theta"],
    ["fn return", body(`fn f(): ${type} { 1 }`), "bug0228.theta"],
    ["schema body field", body(`schema S { p: ${type} }`), "bug0228.theta"],
    ["alias RHS", body(`schema S = ${type}`), "bug0228.theta"],
    ["@<T> annotation root", annotSrc(type), "bug0228.theta"],
    ["invoke<T>", body(`let r = invoke<${type}>("./x.theta")`), "bug0228.theta"],
    [".thetalib schema field", `schema S { p: ${type} }\n`, "lib.thetalib"],
    ["nested one level", body(`let x: { q: ${type} } | null = null`), "bug0228.theta"],
    ["params: field", paramsSrc(`  p: '${type}'`), "bug0228.theta"],
    ["array<> generic argument", body(`let x: array<${type}> | null = null`), "bug0228.theta"],
  ];
}

/** The eleven refusal-bearing positions, by label; the twelfth is the carve-out. */
const POSITION_LABELS = [
  "let annotation",
  "let mut annotation",
  "fn parameter",
  "fn return",
  "schema body field",
  "alias RHS",
  "@<T> annotation root",
  "invoke<T>",
  ".thetalib schema field",
  "nested one level",
  "params: field",
] as const;

const CARVE_OUT_LABEL = "array<> generic argument";

// ===========================================================================
// Parse + assertion helpers.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "bug0228.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

function codes(src: string, path = "bug0228.theta"): string[] {
  return parseDoc(src, path).diagnostics.map((d) => d.code);
}

// ---------------------------------------------------------------------------
// The three capture sites, read STRAIGHT OFF THE AST — the strings the checker
// and the two lowerers receive, ahead of any rule.
// ---------------------------------------------------------------------------

/** `LetStmt.annotation` (src/parser/theta-document.ts:407) — `parseType`'s join. */
function capturedLetAnnotation(type: string): string {
  const src = body(`let x: ${type} = 1`);
  const doc = parseDoc(src, "bug0228.theta");
  const stmt = doc.body.statements[0];
  expect(
    stmt?.kind,
    `the let fixture's first statement must be the binding; source=${JSON.stringify(src)}`,
  ).toBe("let");
  const annotation = (stmt as LetStmt).annotation;
  expect(typeof annotation, "the binding must have captured its annotation text").toBe("string");
  return annotation as string;
}

/** `QueryExpr.schema` (:214) — `parseQuery`'s own join at :5085. */
function capturedQuerySchema(type: string): string {
  const src = annotSrc(type);
  const doc = parseDoc(src, "bug0228.theta");
  const stmt = doc.body.statements[0];
  expect(
    stmt?.kind,
    `the @<T> fixture's first statement must be the \`let r = @<T>\` binding; source=${JSON.stringify(src)}`,
  ).toBe("let");
  const init = (stmt as LetStmt).init;
  expect(init?.kind, "that binding's initialiser must be the query expression").toBe("query");
  const schema = (init as QueryExpr).schema;
  expect(typeof schema, "the query expression must carry its `@<T>` annotation text").toBe("string");
  return schema as string;
}

/** `InvokeExpr.returnSchema` (:206) — `parseInvoke`'s own join at :4924. */
function capturedInvokeReturnSchema(type: string): string {
  const src = body(`let r = invoke<${type}>("./x.theta")`);
  const doc = parseDoc(src, "bug0228.theta");
  const stmt = doc.body.statements[0];
  expect(
    stmt?.kind,
    `the invoke fixture's first statement must be the binding; source=${JSON.stringify(src)}`,
  ).toBe("let");
  const init = (stmt as LetStmt).init;
  expect(init?.kind, "that binding's initialiser must be the invoke expression").toBe("invoke");
  const returnSchema = (init as InvokeExpr).returnSchema;
  expect(typeof returnSchema, "the invoke expression must carry its `<T>` annotation text").toBe(
    "string",
  );
  return returnSchema as string;
}

/** The `$defs` fragment `params:` mints for one inline type, by DIRECT call. */
function paramsFragment(type: string): Record<string, unknown> {
  const defs: Record<string, Record<string, unknown>> = {};
  const unresolved: string[] = [];
  const ctx: LowerCtx = { bodyTypeMap: new Map(), defs, unresolved };
  const ref = lowerParamsFieldType(type, ctx) as { readonly $ref?: string };
  const slug = (ref.$ref ?? "").replace("#/$defs/", "");
  expect(
    Object.keys(defs),
    `the \`params:\` lowering must hoist exactly one \`$defs\` member for ${JSON.stringify(type)}`,
  ).toEqual([slug]);
  return defs[slug] as Record<string, unknown>;
}

// ===========================================================================
// THE DIAGNOSTIC-LIST INVENTORY. Every cell is one source, one whole ordered
// UNFILTERED expectation. Held as data so cell I1 can count it and cell I2 can
// re-assert all of it at CODE level with no registry dependency.
// ===========================================================================

interface Cell {
  readonly cell: string;
  readonly src: string;
  readonly path?: string;
  readonly expected: readonly Exp[];
}

/**
 * One inline type at every position, with one expectation for the eleven
 * refusal-bearing positions and one for the generic-argument carve-out.
 */
function positionCells(
  group: string,
  type: string,
  atEleven: readonly Exp[],
  atCarveOut: readonly Exp[],
): Cell[] {
  return positionSources(type).map(([label, src, path]) => ({
    cell: `${group} ${label}`,
    src,
    path,
    expected: label === CARVE_OUT_LABEL ? atCarveOut : atEleven,
  }));
}

/**
 * One inline type at every position, with a PER-LABEL expectation map — used
 * only by row E3, the one bound whose refusal code is the position's own.
 */
function positionCellsByLabel(
  group: string,
  type: string,
  byLabel: Readonly<Record<string, readonly Exp[]>>,
): Cell[] {
  return positionSources(type).map(([label, src, path]) => {
    const expected = byLabel[label];
    expect(expected, `${group}: no expectation declared for position ${label}`).toBeDefined();
    return { cell: `${group} ${label}`, src, path, expected: expected as readonly Exp[] };
  });
}

/** (C) §Reproduction (b) — `{a b: integer, ab: string}`, two source names, one fused key. */
const B_FIXTURE = "{a b: integer, ab: string}";

// RE-PINNED for bug 0233
// (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md): the
// generic-argument gate this row inherited from its three raw-key neighbours
// is gone from `walkType`'s raw-key loop, so the carve-out cell now draws the
// same refusal as the ten joining positions (`ab` never repeats, so it is
// only `a b` that is refused, once, at every position including this one).
function bFixtureCells(): Cell[] {
  return positionCells("c1", B_FIXTURE, [NOTIDENT("a b")], [NOTIDENT("a b")]);
}

/** (E) §Reproduction (d) — `{A b: integer}`, D1–D6 inside the eleven-position map. */
const D_FIXTURE = "{A b: integer}";

// RE-PINNED for bug 0233: the raw-key row now answers inside a generic
// argument exactly as bug 0154's identifier pass always did there, so the
// carve-out cell draws the same single `NOTIDENT("A b")` line the ten joining
// positions draw — bug 0129's count-consequence law (code-registry-parse.md:101)
// suppresses a second line on the SAME field, and this fixture has one field.
function dFixtureCells(): Cell[] {
  return positionCells("d1", D_FIXTURE, [NOTIDENT("A b")], [NOTIDENT("A b")]);
}

/** (D) §Reproduction (c) C1–C7 — the fabricated names, at both capture readings. */
interface LoweringRow {
  readonly cell: string;
  readonly type: string;
  /** The property names the AUTHOR wrote, in source order. */
  readonly keys: readonly string[];
  /** The raw keys this row refuses, in source order. */
  readonly refused: readonly string[];
}

const LOWERING_ROWS: readonly LoweringRow[] = [
  { cell: "C1", type: "{a b: integer}", keys: ["a b"], refused: ["a b"] },
  { cell: "C2", type: "{a b c: integer}", keys: ["a b c"], refused: ["a b c"] },
  { cell: "C3", type: "{_a b: integer}", keys: ["_a b"], refused: ["_a b"] },
  { cell: "C4", type: "{mut a: integer}", keys: ["mut a"], refused: ["mut a"] },
  { cell: "C5", type: "{let b: integer}", keys: ["let b"], refused: ["let b"] },
  { cell: "C6", type: "{a b: integer, a: string}", keys: ["a b", "a"], refused: ["a b"] },
  { cell: "C7", type: "{a: integer, b c: void}", keys: ["a", "b c"], refused: ["b c"] },
];

/**
 * Each C-row's refusal at the two READINGS the report contrasts: the `let`
 * annotation (a joining position at HEAD) and `params:` (the verbatim one). One
 * verdict at both is the position-invariance `type-system.md:15` states.
 */
function loweringRefusalCells(): Cell[] {
  const out: Cell[] = [];
  for (const row of LOWERING_ROWS) {
    const expected = row.refused.map((key) => NOTIDENT(key));
    out.push({
      cell: `d2 ${row.cell} let annotation`,
      src: body(`let x: ${row.type} | null = null`),
      expected,
    });
    out.push({
      cell: `d2 ${row.cell} params: field`,
      src: paramsSrc(`  p: '${row.type}'`),
      expected,
    });
  }
  return out;
}

/** (F) §Reproduction (e) — the five bounds. */
const E1_TYPE = "{ a: integer, b: string }";
const E2_TYPE = '{a: "x y"}';
const E3_TYPE = "{a: integer b: string}";
const E4_TYPE = '{"a b": integer}';
const E5_TYPE = "{a: integer, a : string}";

function boundCells(): Cell[] {
  return [
    // E1 / E2 — the NO-MOVE controls: a well-formed interior loses only spacing
    // that no rule and no lowerer reads (E1), and a string literal is ONE token
    // so its interior spacing survives the join already (E2). Both are silent at
    // every position before and after, and group (F)'s byte cells pin their
    // lowerings.
    ...positionCells("f1 (E1)", E1_TYPE, [], []),
    ...positionCells("f2 (E2)", E2_TYPE, [], []),
    // E3 — the missing-comma shape. Refused at every position TODAY, by the
    // position's own `*-type-not-expression` row, and UNMOVED by this fix: with
    // the author's spacing restored, `{a: integer b: string}`'s second entry
    // still spells no `Field`, so the node still derives from no `Type`. This is
    // the bound that keeps §Fix (b)'s new row from being a widening of those
    // four rows: the two questions are different.
    ...positionCellsByLabel("f3 (E3)", E3_TYPE, {
      "let annotation": [ANNOTNOTEXPR("x")],
      "let mut annotation": [ANNOTNOTEXPR("x")],
      "fn parameter": [ANNOTNOTEXPR("p")],
      "fn return": [ANNOTNOTEXPR("f")],
      "schema body field": [SCHEMANOTEXPR("S")],
      "alias RHS": [SCHEMANOTEXPR("S")],
      "@<T> annotation root": [QUERYNOTEXPR()],
      // `invoke<T>` runs no annotation-shape refusal of its own — measured at
      // HEAD, unmoved here, and not this report's subject.
      "invoke<T>": [],
      ".thetalib schema field": [SCHEMANOTEXPR("S")],
      "nested one level": [ANNOTNOTEXPR("x")],
      "params: field": [PARAMSNOTEXPR("p")],
      [CARVE_OUT_LABEL]: [],
    }),
    // E4 — a quote is ONE token, so bug 0176's first-character trigger is
    // already position-invariant and this fix moves neither its verdict nor its
    // rendered subject. It is also the precedence control: a quote-led key is
    // the SECOND rule's alone and must never draw the new row, even though
    // `"a b"` is no `Ident` either. RE-PINNED for bug 0233: the
    // generic-argument gate this row inherited from bug 0052 is gone from
    // `walkType`'s raw-key loop, so the carve-out cell now answers alike too.
    ...positionCells("f4 (E4)", E4_TYPE, [QUOTED('"a b"')], [QUOTED('"a b"')]),
    // E5 — whitespace OUTSIDE a key is absorbed by the duplicate rule's
    // `trim()` at every position, so it is not this defect and does not move.
    // Also the precedence control for the FIRST rule: a repeating key is bug
    // 0052's alone. RE-PINNED for bug 0233, the same way as E4: the
    // generic-argument carve-out is gone, so this cell now answers alike too.
    ...positionCells("f5 (E5)", E5_TYPE, [DUP("a")], [DUP("a")]),
  ];
}

/**
 * (H) The ONE-ROW law, asserted on its own two spellings: exactly one
 * diagnostic, naming the RAW key, with no `binding-case-mismatch` and no
 * `reserved-keyword-as-identifier` beside it (bug 0129's count-consequence
 * law). `{A b: integer}` is §Reproduction (d)'s fixture, whose uppercase head
 * draws the fabricated case row at ten positions today; `{let b: integer}` is
 * §Reproduction (c) row C5, whose fused `letb` is silent at every position
 * today.
 */
function oneRowLawCells(): Cell[] {
  return [
    { cell: "h1 {A b: integer} @<T>", src: annotSrc(D_FIXTURE), expected: [NOTIDENT("A b")] },
    {
      cell: "h1 {A b: integer} let",
      src: body(`let x: ${D_FIXTURE} | null = null`),
      expected: [NOTIDENT("A b")],
    },
    {
      cell: "h2 {let b: integer} @<T>",
      src: annotSrc("{let b: integer}"),
      expected: [NOTIDENT("let b")],
    },
    {
      cell: "h2 {let b: integer} let",
      src: body("let x: {let b: integer} | null = null"),
      expected: [NOTIDENT("let b")],
    },
  ];
}

/** The whole diagnostic-list inventory, in group order. */
function allCells(): Cell[] {
  return [
    ...bFixtureCells(),
    ...loweringRefusalCells(),
    ...dFixtureCells(),
    ...boundCells(),
    ...oneRowLawCells(),
  ];
}

/** Declared inventory size — cell I1 recomputes it (anti-vacuity). */
const TOTAL_LIST_CELLS = 102;
// RE-PINNED for bug 0233: the generic-argument carve-out cells of groups (C)
// and (E) now name this row too (40 → 42).
/** Declared count of cells carrying the new row — cell I1 recomputes it. */
const NEW_ROW_LIST_CELLS = 42;

/**
 * One group's cells asserted as a whole-map equality: separate assertions would
 * stop at the first divergence and hide the rest, and the position-invariance /
 * precedence / one-row claims above are only meaningful against whole lists.
 */
function expectGroup(cells: readonly Cell[], why: string): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const c of cells) {
    const key = `${c.cell} :: ${c.src}`;
    actual[key] = lines(c.src, c.path);
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}

// ===========================================================================
// (A) THE REGISTRY (DIAG-2) AND THE PLACEHOLDER DISPOSITION. Asserted first and
// on their own so the registry half of the fix is a NAMED red rather than a
// confusing failure inside every other cell's expectation builder.
// RED at HEAD: A0 (no such row) and A1 (no third carve-out) — SYMPTOM 3.
// ===========================================================================

describe("bug 0228 (A) — the row §Fix (b) mints for a raw inline key that is no identifier", () => {
  it("RED A0: the registry carries `theta/parse/inline-field-name-not-identifier`, E, parse, with its normative Message", () => {
    const row = REGISTRY.find((r) => r.code === NOT_IDENT);
    expect(
      row,
      "A0 — docs/spec_topics/diagnostics/code-registry-parse.md must carry the " +
        `${NOT_IDENT} row; the registry is closed (DIAG-2, diagnostic-shape.md:72), so the row ` +
        "and the emission land in one commit. §Fix (b) settles on a NEW inline row rather than " +
        "widening the four `*-type-not-expression` rows, because those rows judge whether the " +
        "TYPE derives from a `Type` production (bound E3, which this file pins unmoved) and " +
        "this row judges whether a `Field`'s NAME is an `Ident` (schemas.md:17, lexical.md:13)",
    ).toBeDefined();
    expect(
      row?.severity,
      "A0 — severity E: `{a b: integer}` derives from no `ObjectType`, so it is refused, not " +
        "warned (type-system.md:15)",
    ).toBe("E");
    expect(
      row?.namespace,
      "A0 — area/namespace `parse`: the detection site is `walkType`'s object arm raw-key loop " +
        "(src/parser/type-grammar.ts:1000), beside its three neighbours",
    ).toBe("parse");
    expect(
      row?.phase,
      "A0 — phase `parse`: the refusal happens at load/parse time, ahead of both lowerers",
    ).toBe("parse");
    expect(
      registryMessage(REGISTRY, NOT_IDENT),
      "A0 — the *Message* is normative (DIAG-4, diagnostic-shape.md:74). The subject is the RAW " +
        "pre-colon key, which is exactly the text the two lowerers would mint as a wire " +
        "property name (schema-subset.md:78)",
    ).toBe("field name '<field>' within one inline object type is not an identifier");
  });

  it("RED A1: `<field>` takes a THIRD row-scoped carve-out on placeholder-rendering-b.md", () => {
    // placeholder-rendering-b.md:10 grants `<field>` a raw-text carve-out on
    // exactly two rows today (bug 0052's and bug 0176's) because their subject
    // is an inline entry's raw pre-colon text; bug 0160's third row renders an
    // IDENTIFIER and is deliberately absent from the sentence. THIS row's
    // subject is the raw key again — the whole point is that the key is NOT an
    // identifier, so it cannot be rendered under the identifier category — so
    // the sentence widens from two rows to three.
    const page = readDiagnosticsPage("placeholder-rendering-b.md");
    expect(
      page,
      `A1 — §"Source-derived placeholders" must name ${NOT_IDENT} as a row whose <field> ` +
        "renders the raw entry text as written. Without it the page says this row renders an " +
        "identifier, which is false by construction: the row exists because the key is not one",
    ).toContain(NOT_IDENT);
    expect(
      page.includes(RENAMED_INLINE),
      `A1 — and bug 0160's ${RENAMED_INLINE} must STAY absent: its <field> is the theta-side ` +
        "identifier the rename is written on, not the raw key, so this fix does not widen the " +
        "sentence to four rows",
    ).toBe(false);
  });
});

// ===========================================================================
// (B) §Reproduction (a) A1–A10 — THE CAPTURE ITSELF, read straight off the AST
// at all THREE capture sites. This is the report's element 1 and the mechanism
// every other group's verdict follows from: the strings below are what the
// checker and the two lowerers receive, ahead of any rule.
// RED at HEAD: every row but the trivial agreement check — SYMPTOM 1 (the
// joined capture). A1 and A9 are the report's own two bounds: A1 loses only
// spacing no rule reads, A9's literal interior survives the join already, and
// under this fix BOTH are the author's bytes exactly.
// ===========================================================================

/** §Reproduction (a) rows A1–A10, in the report's order. */
const CAPTURE_ROWS: readonly (readonly [string, string])[] = [
  ["A1", "{ a: integer, b: string }"],
  ["A2", "{a b: integer, ab: string}"],
  ["A3", "{A b: integer}"],
  ["A4", "{let b: integer}"],
  ["A5", "{mut a: integer}"],
  ["A6", "{a b c: integer}"],
  ["A7", "{_a b: integer}"],
  ["A8", "{ p: { a b: integer, ab: string } }"],
  ["A9", '{a: "x y" | "z"}'],
  ["A10", "{a: integer b: string}"],
];

describe("bug 0228 (B) — the type-source capture is the author's text, at all three capture sites", () => {
  it("RED B1: rows A1–A10 at the `let` annotation, the `@<T>` root and `invoke<T>`", () => {
    const actual: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    for (const [row, type] of CAPTURE_ROWS) {
      actual[`${row} ${type}`] = {
        "LetStmt.annotation": capturedLetAnnotation(type),
        "QueryExpr.schema": capturedQuerySchema(type),
        "InvokeExpr.returnSchema": capturedInvokeReturnSchema(type),
      };
      expected[`${row} ${type}`] = {
        "LetStmt.annotation": type,
        "QueryExpr.schema": type,
        "InvokeExpr.returnSchema": type,
      };
    }
    expect(
      actual,
      "B1 — grammar.md:109 states the inline rules over the entries' text 'taken as written', " +
        "and type-system.md:15 runs one type grammar in every position. A capture that deletes " +
        "inter-token whitespace makes the effective grammar of ten positions wider than the " +
        "written one and different from `params:`. Under §Fix (a) variant B the balanced brace " +
        "group is sliced out of `this.bodyText` (the treatment the query template already has " +
        "at src/parser/theta-document.ts:5130–5140), so every row is the author's spelling. A " +
        "red here on the JOINED text is bug 0228's element 1; a red on some THIRD text means " +
        "the slice bounds are wrong",
    ).toEqual(expected);
  });

  it("RED B2: the three sites agree byte-for-byte on every row", () => {
    // The agreement is a property of the DESIGN, not of the fix: all three sites
    // join identically at HEAD and all three slice identically after. The cell
    // exists so a fix that repairs `parseType` alone — leaving `parseQuery`'s
    // and `parseInvoke`'s own loops joined — reds here rather than passing B1's
    // `let` column in isolation.
    const disagreeing: string[] = [];
    for (const [row, type] of CAPTURE_ROWS) {
      const three = [
        capturedLetAnnotation(type),
        capturedQuerySchema(type),
        capturedInvokeReturnSchema(type),
      ];
      if (new Set(three).size !== 1) disagreeing.push(`${row} ${JSON.stringify(three)}`);
    }
    expect(
      disagreeing,
      "B2 — the three captures must be one text: `production-theta-producer.ts:2672` lowers " +
        "`QueryExpr.schema` and `:3834` lowers `InvokeExpr.returnSchema` through the SAME " +
        "`lowerQueryResponseSchema`, so two sites disagreeing is two wire contracts for one " +
        "spelling",
    ).toEqual([]);
    expect(CAPTURE_ROWS.length, "B2 — ten capture rows, none dropped").toBe(10);
  });
});

// ===========================================================================
// (C) §Reproduction (b) B1–B11 — ONE verdict at all eleven positions, plus the
// generic-argument position (a twelfth cell since bug 0233). `{a b: integer,
// ab: string}` spells TWO distinct field names; at HEAD the fused key
// manufactures a repeat and `duplicate-inline-field-name` renders `'ab'` — a
// key the source does not contain — at ten positions, and `params:` loads it
// clean.
// RED at HEAD: all eleven refusal cells — SYMPTOM 2 (the fabricated verdict).
// RE-PINNED for bug 0233
// (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md): the
// generic-argument cell, silent through this file's own fix, now draws the
// same refusal as the other eleven — the raw-key gate no longer withholds an
// object reached through a generic type argument.
// ===========================================================================

describe("bug 0228 (C) — `{a b: integer, ab: string}` draws exactly one refusal at every position", () => {
  it("C1: the eleven positions and the generic argument, whole ordered lists", () => {
    expectGroup(
      bFixtureCells(),
      "C1 — the source has NO repeated field name, so the fabricated " +
        `${DUPLICATE_INLINE} naming 'ab' must be GONE at the ten joining positions (the ` +
        "newly-ADMITTED set this fix must state explicitly), and the key the author did write, " +
        "`a b`, must be refused ONCE at every one of the twelve positions — at `params:` where " +
        "the same text loads clean today, and inside `array<>` where bug 0233 removed the " +
        "generic-argument gate this rule used to inherit from its raw-key neighbours. A cell " +
        "that still names 'ab' is the join; a cell that names 'a b' twice is a precedence or " +
        "loop error; a `[]` on the `array<>` cell is bug 0233's withheld gate returning",
    );
  });

  it("C2: the same cells at CODE level, and the eleven positions stop loading cleanly", () => {
    // The registry-independent half of C1: this reds on the WRONG VERDICT alone,
    // so the parse-gate half of the fix has its own witness while the registry
    // half is outstanding.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const c of bFixtureCells()) {
      const key = `${c.cell} :: ${c.src}`;
      actual[key] = codes(c.src, c.path);
      expected[key] = codesOf(c.expected);
    }
    expect(
      actual,
      "C2 — one code at eleven positions and none inside the generic argument. No registry " +
        "template is consulted here, so a red is the emission set and never the prose",
    ).toEqual(expected);

    const loadingCleanly: string[] = [];
    for (const [label, src, path] of positionSources(B_FIXTURE)) {
      if (label === CARVE_OUT_LABEL) continue;
      const doc = parseDoc(src, path);
      if (!doc.diagnostics.some((d) => d.severity === "error")) loadingCleanly.push(label);
    }
    expect(
      loadingCleanly,
      "C2 — an error-severity diagnostic is what takes the source out of the loads-cleanly set " +
        "(source-language-stability.md) and what withholds the artefacts group (D) measures. " +
        "`params:` is the position that loads this text cleanly at HEAD",
    ).toEqual([]);
    expect(POSITION_LABELS.length, "C2 — eleven positions, none dropped").toBe(11);
  });

  it("RED C3: the refused `params:` field mints no lowered schema at all", () => {
    // The `params:` consequence is not only a diagnostic: a refused `params:`
    // type withholds the WHOLE frontmatter, so `frontmatter.params.loweredSchema`
    // — the bytes `production-theta-producer.ts:822` hands the binder as
    // `paramsSchema` — is never minted. The three neighbour rows already behave
    // exactly this way, which cell C4 measures at HEAD as the control.
    expect(
      parseDoc(paramsSrc(`  p: '${B_FIXTURE}'`), "bug0228.theta").frontmatter,
      "C3 — at HEAD this frontmatter exists and its `$defs` member carries TWO properties, " +
        "`a b` and `ab`, neither of which is a wire name any theta expression can address " +
        "(schema-subset.md:78, lexical.md:13)",
    ).toBeNull();
  });

  it("CONTROL C4: the same gate under the three neighbour rows, and open for a clean type", () => {
    expect(
      parseDoc(paramsSrc(`  p: '${E5_TYPE}'`), "bug0228.theta").frontmatter,
      "C4 — bug 0052's row already closes the gate at `params:` for a repeating key; this is " +
        "the shape cell C3 asserts for the non-identifier one",
    ).toBeNull();
    expect(
      parseDoc(paramsSrc(`  p: '${E4_TYPE}'`), "bug0228.theta").frontmatter,
      "C4 — and bug 0176's row closes it for a quote-led key",
    ).toBeNull();
    expect(
      parseDoc(paramsSrc(`  p: '${E1_TYPE}'`), "bug0228.theta").frontmatter,
      "C4 — while a well-formed inline type still registers, so C3's red cannot be a broken " +
        "harness",
    ).not.toBeNull();
  });
});

// ===========================================================================
// (D) §Reproduction (c) C1–C7 — THE TWO LOWERINGS, now one. "Joined lowering"
// is `lowerQueryResponseSchema(<captured text>, [], [])`, the call
// `production-theta-producer.ts:2672` makes on `QueryExpr.schema`; the
// `params:` lowering is the `$defs` member `hoistInlineObjectType` mints from
// the author's text. At HEAD they disagree on every row — `ab` against `a b` —
// so one source text has two wire contracts. After the fix both read one
// string, so they agree, and the refusal fires at BOTH readings.
// RED at HEAD: D1 (the captured text and the joined keys) — SYMPTOM 1 — and D2
// (the refusal at both readings) — SYMPTOM 2. D3 is the reachable-loading
// control, green in both directions.
// ===========================================================================

describe("bug 0228 (D) — the joined lowering and the `params:` lowering agree, and both readings refuse", () => {
  it("RED D1: rows C1–C7 — one captured text, one set of lowered property names", () => {
    const actual: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    for (const row of LOWERING_ROWS) {
      const captured = capturedLetAnnotation(row.type);
      const joined = lowerQueryResponseSchema(captured, [], []) as Record<string, unknown>;
      const fromParams = paramsFragment(row.type);
      actual[`${row.cell} ${row.type}`] = {
        captured,
        "joined properties": Object.keys((joined["properties"] ?? {}) as object),
        "joined required": joined["required"],
        "joined === params: fragment": JSON.stringify(joined) === JSON.stringify(fromParams),
      };
      expected[`${row.cell} ${row.type}`] = {
        captured: row.type,
        "joined properties": [...row.keys],
        "joined required": [...row.keys],
        "joined === params: fragment": true,
      };
    }
    expect(
      actual,
      "D1 — schema-subset.md:78 keys `properties` and `required` by WIRE NAMES. At HEAD the " +
        "joined reading mints `ab` / `abc` / `muta` / `letb` and `params:` mints `a b` / " +
        "`a b c` / `mut a` / `let b`, so a theta that moves an inline object from a `params:` " +
        "field to a `let` annotation changes its wire contract silently. A red on `captured` is " +
        "bug 0228's element 1; a red on the equality flag is element 3 (the same text with two " +
        "meanings)",
    ).toEqual(expected);
  });

  it("RED D2: each row refused at BOTH readings — the `let` annotation and `params:`", () => {
    expectGroup(
      loweringRefusalCells(),
      "D2 — §Expected: what is not admissible is loading these interiors and minting a property " +
        "name no author wrote, at EITHER reading. C5 (`{let b: integer}`) must draw this row and " +
        "NOT `" +
        RESERVED_KEYWORD +
        "`, and C7 (`{a: integer, b c: void}`) must draw it once for `b c` and nothing for the " +
        "well-formed `a` beside it — one diagnostic per offending field",
    );
  });

  it("CONTROL D3: a well-formed interior's two readings agree today and after, through the LOAD", () => {
    // The literal `doc.frontmatter.params.loweredSchema` comparison §Fix (e)
    // asks for, on the one row where the artefact is still reachable through a
    // load: E1 draws no refusal at any position, so its `params:` frontmatter is
    // minted and its bytes can be compared with the annotation reading's. Every
    // C-row's `params:` frontmatter is withheld after the fix (cell C3's
    // mechanism), which is why D1 compares the `params:` fragment by direct
    // call.
    const doc = parseDoc(paramsSrc(`  p: '${E1_TYPE}'`), "bug0228.theta");
    const lowered = doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined;
    expect(
      lowered,
      `D3 — the well-formed interior must still lower through the load; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toBeDefined();
    const defs = (lowered?.["$defs"] ?? {}) as Record<string, unknown>;
    const slugs = Object.keys(defs);
    expect(slugs, "D3 — exactly one hoisted inline member (schema-subset.md:73)").toEqual([
      "__inline_9b890568745f5ea5",
    ]);
    const fragment = {
      type: "object",
      properties: { a: { type: "integer" }, b: { type: "string" } },
      required: ["a", "b"],
      additionalProperties: false,
    };
    expect(
      defs[slugs[0] as string],
      "D3 — bug 0035's / bug 0039's `params:` byte freeze: a well-formed interior's lowered " +
        "bytes do NOT move under variant B, and neither does the content-addressed `$defs` name " +
        "derived from them",
    ).toEqual(fragment);
    expect(
      lowerQueryResponseSchema(capturedLetAnnotation(E1_TYPE), [], []),
      "D3 — and the annotation reading's own lowering is byte-identical, before and after: this " +
        "is §Reproduction (e) row E1, the bound that proves the fix moves no well-formed " +
        "interior's wire contract",
    ).toEqual(fragment);
    expect(
      lowerQueryResponseSchema(capturedLetAnnotation(E2_TYPE), [], []),
      "D3 — row E2's bound too: a string literal is ONE token, so its interior spacing survived " +
        "the join already and its lowering is unmoved",
    ).toEqual({
      type: "object",
      properties: { a: { const: "x y" } },
      required: ["a"],
      additionalProperties: false,
    });
  });
});

// ===========================================================================
// (E) §Reproduction (d) D1–D6 — 0154's identifier pass. `{A b: integer}`
// currently draws `theta/parse/binding-case-mismatch` at the ten joining
// positions (row D5 included: that pass carries no generic-argument carve-out)
// and nothing at `params:`. The refused name `Ab` appears in no source; the
// name the author did write, `A`, is refused at ten positions BY ACCIDENT and
// admitted at the eleventh, where the lowering leaks it to the wire.
// D1 = `let annotation`, D2 = `fn parameter`, D3 = `schema body field` +
// `.thetalib schema field`, D4 = `@<T> annotation root`,
// D5 = `array<> generic argument`, D6 = `params: field`.
// RED at HEAD: all eleven refusal cells and the carve-out cell — SYMPTOM 2.
// RE-PINNED for bug 0233: the raw-key row now answers inside a generic
// argument exactly as bug 0154's identifier pass always did there (row D5),
// so the carve-out cell draws `A b` too, once — bug 0129's count-consequence
// law keeps it to one line since `A b` is a single field.
// ===========================================================================

describe("bug 0228 (E) — `{A b: integer}` draws one refusal naming `A b`, and no case row anywhere", () => {
  it("E1: D1–D6 inside the eleven-position map, plus the generic argument, whole ordered lists", () => {
    expectGroup(
      dFixtureCells(),
      "E1 — the fabricated " +
        BINDING_CASE +
        " must be GONE at the ten joining positions (it names `Ab`, which no source contains) " +
        "and the raw key `A b` must be refused once everywhere, `params:` and the generic " +
        "argument included. Bug 0233 removed the generic-argument gate this row inherited from " +
        "its three raw-key neighbours, so the `array<>` cell now answers exactly as 0154's " +
        "identifier pass already did there — a `[]` there is the withheld gate returning",
    );
  });

  it("RED E2: no `binding-case-mismatch` survives at any position, and the plain control still draws it", () => {
    const withCaseRow = positionSources(D_FIXTURE)
      .filter(([, src, path]) => codes(src, path).includes(BINDING_CASE))
      .map(([label]) => label);
    expect(
      withCaseRow,
      "E2 — bug 0129's count-consequence law: a field this row refuses draws NO other error row " +
        "on the same field. `A` never enters `TypeNode.fieldNames` once the author's spacing " +
        "survives — `parseObject`'s field loop breaks at `A b` before the push — which is " +
        "exactly why `params:` is silent today (§Reproduction (d) row D6)",
    ).toEqual([]);
    expect(
      codes(annotSrc("{Ys: string}")),
      "E2 — while the PLAIN ill-cased spelling still draws it, so the absence above is a " +
        "property of the non-identifier key and not of a disturbed pass (0154's row keeps its " +
        "trigger and its emission set on every interior with no inter-token whitespace inside a " +
        "key — bug 0228 §Non-goals)",
    ).toEqual([BINDING_CASE]);
  });
});

// ===========================================================================
// (F) §Reproduction (e) — THE FIVE BOUNDS. E1 and E2 are the explicit NO-MOVE
// controls (their lowered bytes are pinned in cell D3, not only their empty
// diagnostic lists); E3, E4 and E5 are the three refusals this fix must leave
// exactly where they are, and they are also the precedence controls for the
// three neighbour rows this one is subordinate to.
// GREEN NOW AND AFTER: E1, E2 and E3 at every position. RE-PINNED for bug
// 0233: E4's and E5's generic-argument cells were silent through this file's
// own fix (the raw-key gate withheld their OWN rows there too) and now draw
// the quoted-key and duplicate-key refusals respectively, since bug 0233
// removed that gate for every raw-key rule.
// ===========================================================================

describe("bug 0228 (F) — the five bounds, unmoved at ten positions and now refused inside the generic argument (bug 0233)", () => {
  it("F1: E1–E5 at all eleven positions and inside the generic argument", () => {
    expectGroup(
      boundCells(),
      "F1 — a red in E1/E2 means the fix moved a well-formed interior's VERDICT, which route 1 " +
        "must not; a red in E3 means the new row was implemented as a widening of the four " +
        "`*-type-not-expression` rows instead of beside them; a red in E4 or E5 means the " +
        "precedence is wrong — a quote-led key is bug 0176's alone and a repeating key is bug " +
        "0052's alone, both ahead of this row",
    );
  });
});

// ===========================================================================
// (G) THE GHOST BOUND and the generic-argument capture. Variant B's brace
// consumer must stop, WITHOUT consuming, at a `>` met at its own angle-depth 0
// while the brace group is still unclosed: otherwise `@<Ghost{>` runs the
// consumer past the annotation's closing `>` and swallows the backtick
// template (the premeasurement's Residual 3, measured as a real defect of the
// unbounded prototype). The `>` INSIDE a balanced generic argument must not
// stop it, and a generic argument's own interior must be captured whole.
// RED at HEAD: G2 and G3's capture bytes — SYMPTOM 1. G1 is GREEN in both
// directions and is the regression bound. RE-PINNED for bug 0233
// (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md): G3's
// diagnostic half moves from silent to refused, since the generic-argument
// gate that row inherited is gone.
// ===========================================================================

describe("bug 0228 (G) — the brace consumer is bounded by the annotation's own `>`", () => {
  it("CONTROL G1: `@<Ghost{>` captures `Ghost{` and the backtick template survives", () => {
    const src = body("let r = @<Ghost{>`hi`");
    const doc = parseDoc(src, "bug0228.theta");
    const init = (doc.body.statements[0] as LetStmt).init as QueryExpr;
    expect(
      init.schema,
      "G1 — the unclosed `{` must not extend the annotation past its own `>`: this is the " +
        "shape bug 0203's `g1` cell pins, and the unbounded prototype captured " +
        '`Ghost{>`hi`\\nr` here instead',
    ).toBe("Ghost{");
    expect(
      init.template,
      "G1 — and the template body must still be the query's, not eaten by the brace consumer",
    ).toBe("hi");
    expect(
      lines(src),
      "G1 — with no new diagnostic on the way: the ghost bound is a capture bound, not a rule",
    ).toEqual([]);
  });

  it("RED G2: `@<{a: array<x>}>` captures the balanced brace group whole", () => {
    const src = body("let r = @<{a: array<x>}>`hi`");
    const doc = parseDoc(src, "bug0228.theta");
    const init = (doc.body.statements[0] as LetStmt).init as QueryExpr;
    expect(
      init.schema,
      "G2 — the `>` of `array<x>` sits at angle-depth 1 INSIDE the brace group, so the ghost " +
        "bound must not stop there; the whole group is the author's text",
    ).toBe("{a: array<x>}");
    expect(
      lines(src),
      "G2 — and the interior's own unresolved named type is unmoved by the capture change",
    ).toEqual(renderAll([UNRESOLVED("x")]));
  });

  it("G3: `array<{a b: integer}>` captures the whole generic argument, and now refuses it (bug 0233)", () => {
    expect(
      capturedLetAnnotation("array<{a b: integer}>"),
      "G3 — text OUTSIDE the brace group keeps today's separator-free join (`array<` + `>`), " +
        "and the group itself is sliced raw, so the whole annotation is the author's spelling",
    ).toBe("array<{a b: integer}>");
    expect(
      lines(body("let x: array<{a b: integer}> | null = null")),
      "G3 — RE-PINNED for bug 0233 " +
        "(docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md): the " +
        "generic-argument gate this row inherited from its three neighbours is gone from " +
        "`walkType`'s raw-key loop, so the captured `a b` is named here exactly as it is at any " +
        "other position. The LOWERING still never divides that interior into fields, so no wire " +
        "key is minted — that fact bounds the wire consequence, not whether this row judges the " +
        "source",
    ).toEqual(renderAll([NOTIDENT("a b")]));
  });
});

// ===========================================================================
// (H) THE ONE-ROW LAW. Bug 0129's count-consequence law: ONE diagnostic per
// offending field, and a field this row refuses draws no other error row on the
// same field. The two spellings whose disposition §Fix (b) says changes with
// the pick are `{A b: integer}` (§Reproduction (d)) and `{let b: integer}`
// (§Reproduction (c) row C5).
// RED at HEAD: both — SYMPTOM 2 (`{A b: integer}` draws the fabricated case
// row; `{let b: integer}` draws nothing at all).
// ===========================================================================

describe("bug 0228 (H) — exactly one row per offending field, naming the raw key", () => {
  it("RED H1: `{A b: integer}` and `{let b: integer}` each draw one diagnostic, whole lists", () => {
    expectGroup(
      oneRowLawCells(),
      "H1 — one row, naming the RAW key (`A b`, `let b`). Two rows means the case pass or the " +
        "reserved-keyword pass also fired on a field this row already refused",
    );
  });

  it("RED H2: neither spelling draws a case row or a reserved-keyword row, at either position", () => {
    const offenders: Record<string, string[]> = {};
    for (const cell of oneRowLawCells()) {
      const list = codes(cell.src, cell.path);
      offenders[cell.cell] = list.filter((c) => c !== NOT_IDENT);
    }
    expect(
      offenders,
      "H2 — the registry-independent restatement of H1: `" +
        BINDING_CASE +
        "` and `" +
        RESERVED_KEYWORD +
        "` both read `TypeNode.fieldNames`, which a non-identifier key never reaches, so the " +
        "only code either spelling may draw is the new row. This is measured at `params:` today " +
        "(§Reproduction (c) row C5 and (d) row D6 are both silent there), so it is the shape " +
        "the other ten positions must take",
    ).toEqual({
      "h1 {A b: integer} @<T>": [],
      "h1 {A b: integer} let": [],
      "h2 {let b: integer} @<T>": [],
      "h2 {let b: integer} let": [],
    });
  });
});

// ===========================================================================
// (I) THE INVENTORY ITSELF — anti-vacuity, and the registry-independent
// restatement of every diagnostic-list cell in the file.
// ===========================================================================

describe("bug 0228 (I) — the inventory is counted, and every cell is also asserted without the registry", () => {
  it("CONTROL I1: 102 diagnostic-list cells, 42 of them naming the new row", () => {
    const cells = allCells();
    expect(
      cells.length,
      "I1 — the declared inventory size. A cell deleted or a group silently dropped moves this " +
        "count, so the file cannot shrink unnoticed",
    ).toBe(TOTAL_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.some((e) => e.code === NOT_IDENT)).length,
      "I1 — the declared count of cells carrying a NON-EMPTY expectation that names " +
        `${NOT_IDENT}. A cell weakened to \`[]\` to make the file green would move this count, ` +
        "which is what makes the red set non-vacuous",
    ).toBe(NEW_ROW_LIST_CELLS);
    expect(
      new Set(cells.map((c) => `${c.cell} :: ${c.src}`)).size,
      "I1 — every cell key is distinct, so no whole-map equality silently drops a row",
    ).toBe(cells.length);
  });

  it("RED I2: the whole inventory at CODE level — the wrong-verdict signature, with no registry dependency", () => {
    // At HEAD every red here is either a MISSING code where a refusal is owed
    // (`{a b: …}` loading clean, `{let b: …}` loading clean) or a FABRICATED
    // code where none is owed (`duplicate-inline-field-name`,
    // `binding-case-mismatch`). It cannot be a message-wording or missing-row
    // failure, because no registry template is consulted.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const c of allCells()) {
      const key = `${c.cell} :: ${c.src}`;
      actual[key] = codes(c.src, c.path);
      expected[key] = codesOf(c.expected);
    }
    expect(
      actual,
      "I2 — the whole inventory's ordered CODE lists. This is the cell to read first on a red: " +
        "a missing `" +
        NOT_IDENT +
        "` entry is the silent-acceptance face of bug 0228; a surviving `" +
        DUPLICATE_INLINE +
        "` or `" +
        BINDING_CASE +
        "` entry is the fabricated-verdict face",
    ).toEqual(expected);
  });
});
