import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { lowerParamsFieldType, type LowerCtx } from "../src/parser/params";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0229 — `topLevelColon` (src/parser/params.ts:1790) latches a quoted
// region without a backslash arm (:1786–1791), while the split that feeds it
// consumes `\` plus the character behind it (`splitTopLevelSegments`,
// src/parser/params.ts:1880–1882). An inline object entry whose wire-name
// string carries an escaped quote — `{a as "w\"x": integer}` — therefore has
// no `:` at depth 0: the scan closes the literal at the ESCAPED `"`, opens a
// new one at the `"` behind `x`, and returns `-1` (:1802). Every consumer
// reads `-1` as "no field here": `inlineObjectFieldKeys`
// (src/parser/type-grammar.ts:752–755) contributes no key, so none of the four
// raw-key rules behind the shared gates (:1021) judges the entry;
// `hoistInlineObjectType` (src/parser/params.ts:1267–1270) and
// `lowerInlineObject` (src/parser/body-type-lowering.ts:183–186) contribute no
// `properties` member and no `required` entry. The author's field is deleted
// from the artefact with nothing on any channel
// (docs/bugs/0229-escaped-quote-wire-name-drops-inline-field.md).
// This file is that report's witness.
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (settled before it was written)
// =====================================================================
// 0229 §Fix (a) — the escape-aware colon scan — with the rename predicate
// widened so the returned key reaches a row rather than falling through:
//   1. `topLevelColon` (src/parser/params.ts:1790) gains the backslash arm its
//      sibling split already has, so `a as "w\"x": integer` yields the colon
//      the author wrote and the key is `a as "w\"x"`.
//   2. `INLINE_FIELD_RENAME` (src/parser/type-grammar.ts:153) widens its
//      wire-name literal alternatives from `"[^"]*"` / `'[^']*'` to
//      `"(?:[^"\\]|\\.)*"` / `'(?:[^'\\]|\\.)*'`, so the escaped interior is
//      admitted and capture group 1 stays the theta-side identifier the row
//      renders (code-registry-parse.md:100).
// §Fix (b) — a new row for the keyless entry — is DECLINED and mints no
// registry row: at the positions the theta lexer reaches, an unterminated
// string literal is refused there (`theta/parse/literal-newline-in-string`),
// and bug 0228's `theta/parse/inline-field-name-not-identifier`
// (docs/spec_topics/diagnostics/code-registry-parse.md:101) backstops a key
// that is none of the three subjects above it over those same positions. At
// `params:` the scalar is a YAML string and never reaches the theta lexer, so
// the unterminated-literal spelling there still spells no key and draws
// nothing — a recorded BOUND of this route, not a class this fix closes. §Fix
// (c) therefore does not arise, and the four-way precedence fixed at
// code-registry-parse.md:100–101 — repeat, quote-led, rename, non-identifier —
// is untouched over the positions it does reach: this route returns a key to
// entries that spelled none and changes no row's precedence.
//
// Constraint 1 of §Fix holds by construction here: the key stays the entry's
// raw pre-colon text after `trim()`, so the rules' keys remain the property
// names both lowerers mint. Group (C) asserts that agreement over the escaped
// spelling directly.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:109 — an inline object's fields reuse the
//     object-schema `Field` form, each is required by default, and a field
//     spelled `ident as "WireName": Type` inside an inline object is
//     `theta/parse/renamed-inline-field-name`, judged over the same raw entry
//     text the duplicate and quoted rules read.
//   - docs/spec_topics/schemas.md:23 — the rename sits between the field
//     identifier and its type, with no constraint on the string literal's
//     contents; :39 — the rename is the only mechanism for a non-identifier
//     wire name.
//   - docs/spec_topics/lexical.md:13 — the string-literal grammar admits `\"`,
//     which is why the escaped spelling is a `Field` and not junk.
//   - docs/spec_topics/schema-subset.md:78 — `properties` is keyed by wire
//     names and `required` carries every one of them, so no admissible outcome
//     drops a field the author wrote.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:98 (duplicate), :99
//     (quoted-led), :100 (rename), :101 (non-identifier) — the four raw-key
//     rows and their precedence.
//   - DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md:72) — the
//     registry is closed; this route mints no row, so every expectation below
//     names a row that already ships.
//   - DIAG-4 (:74) — the *Message* column is normative; every expected message
//     here is read out of the registry through `registryMessage`, none is
//     copied as prose.
//   - docs/spec_topics/governance/source-language-stability.md:25 — the
//     diagnostic-registry carve-out, addition arm, which dispositions every
//     spelling this file newly refuses. §Reproduction (E) measured zero
//     committed `.theta` / `.thetalib` in the input set.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39, the shipped load path behind the inert offline
// `parseDeps` double) or one direct lowerer call
// (`lowerQueryResponseSchema` src/runtime/query-schema-lowering.ts:153,
// `lowerParamsFieldType` src/parser/params.ts:1761). An integration or live
// tier reaches no observable this tier cannot: the defect is a character scan
// over a string, and the artefact it corrupts is returned by value.
//
// WHAT IS RED AT HEAD 36128659 (v0.179.0), derived from measurement before it
// was written: every ESC cell of group (A) — the eight `Type` positions, the
// four further spellings and their `params:` twins — reports `[]`; group (B)'s
// b1, b4 and b5 report `[]`; group (C)'s C1 lowers to an object with no
// properties, `lowerParamsFieldType` returns the permissive `{}` with no
// `$defs` hoist, and C5 equals C6 byte-for-byte under one shared slug
// `__inline_8cc8cb1e7074a3af`; group (D)'s D1 drops its property; group (E)'s
// two `params:` documents register and mint permissive artefacts instead of
// being refused. CONTROLS, green now and after: every CTL cell of (A), the
// generic-argument withhold a9, (B)'s b2 and b3, (C)'s C6 and C7 bytes, (D)'s
// D2, and (E)'s refused-rename and clean-type reads.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. The
// registry lookup asserts each row's presence and its placeholder before any
// template is used, so a missing or reworded row reds by naming the registry;
// every diagnostic cell asserts the whole UNFILTERED ordered list, so a missing
// emission can never read as a pass; and the whole inventory is asserted a
// second time at CODE level with no registry dependency (cell F2), so the
// silence signature is witnessed without the message oracle.
//
// ANTI-VACUITY: the diagnostic-list inventory is 33 cells, 25 of which carry a
// non-empty expectation naming `theta/parse/renamed-inline-field-name`. Cell F1
// recomputes both counts from the inventory itself and names the two cells
// allowed to expect nothing, so no cell can be weakened to `[]` to buy green.

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

/** The three landed raw-key rows an escape-blind colon scan takes out of play. */
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
/** The lowering's own sink — the observable that a field's type was reached. */
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
 * The rename row's subject is the predicate's capture group — the theta-side
 * identifier — not the raw key, so the widened predicate must keep group 1 at
 * the identifier and the escaped spelling renders exactly as the unescaped one
 * does (code-registry-parse.md:100).
 */
function REN(field: string): Exp {
  return { severity: "error", code: RENAMED_INLINE, fills: [["<field>", field]] };
}
/** The quoted-led and duplicate rows render the RAW key (their `<field>` carve-outs). */
function QUOTED(key: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", key]] };
}
function DUP(key: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", key]] };
}
function UNRESOLVED(name: string): Exp {
  return { severity: "error", code: UNRESOLVED_NAMED, fills: [["<name>", name]] };
}

// ===========================================================================
// Fixtures, in the vocabulary of the landed sibling witnesses
// (tests/inline-object-wire-name-rename-refusal.test.ts). Every body fixture
// ends `let a = 1` + `a` so the theta carries a tail expression, and every
// fixture carries `mode: prompt` so no `theta/load/missing-mode` noise is
// present.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/**
 * A `mode: prompt` theta whose `params:` block is `block`. The type is written
 * as a SINGLE-quoted YAML scalar so the interior double quote and its backslash
 * reach the theta type grammar intact — the spelling §Reproduction measures.
 */
function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — the position whose lowering IS the document root. */
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

/** The subject: a wire-name string carrying an escaped quote. */
const ESC = '{a as "w\\"x": integer}';
/** The same spelling one character shorter — the control that already refuses. */
const CTL = '{a as "w": integer}';
/** Two fields, the escaped rename first, and the reversed order. */
const ESC_TWO = '{a as "w\\"x": integer, b: integer}';
const ESC_TWO_REV = '{b: integer, a as "w\\"x": integer}';
/** The quote-led key with the same escape — bug 0176's row's subject. */
const ESC_QUOTED = '{"w\\"x": integer}';
/** The single-quoted rename with the same escape. */
const ESC_SINGLE = "{a as 'w\\'x': integer}";
/**
 * The same interior, YAML-doubled so the two interior `'` survive a
 * single-quoted YAML scalar (the outer quote plus each interior `'` written
 * twice) instead of ending the scalar early.
 */
const ESC_SINGLE_YAML = "{a as ''w\\''x'': integer}";
/** One spelling twice — bug 0052's row's subject. */
const ESC_DUP = '{a as "w\\"x": integer, a as "w\\"x": string}';
/** The escaped key's own theta-side identifier and raw key, as the rows render them. */
const ESC_IDENT = "a";
const ESC_KEY = 'a as "w\\"x"';
const ESC_QUOTED_KEY = '"w\\"x"';

// ===========================================================================
// Parse + assertion helpers.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "bug0229.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

function codes(src: string, path = "bug0229.theta"): string[] {
  return parseDoc(src, path).diagnostics.map((d) => d.code);
}

/** A fresh `params:` lowering context plus the `$defs` it registers. */
function paramsFragment(type: string): {
  readonly fragment: Record<string, unknown>;
  readonly defs: Record<string, Record<string, unknown>>;
  readonly unresolved: string[];
} {
  const defs: Record<string, Record<string, unknown>> = {};
  const unresolved: string[] = [];
  const ctx: LowerCtx = { bodyTypeMap: new Map(), defs, unresolved };
  return { fragment: lowerParamsFieldType(type, ctx), defs, unresolved };
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
    const key = `${c.cell} :: ${c.src}`;
    actual[key] = lines(c.src, c.path);
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}

// ===========================================================================
// (A) §Reproduction (A) — the escaped spelling is refused at every position the
// unescaped control is refused at, and withheld exactly where the control is
// withheld. Each ESC cell sits beside its CTL twin, so a red that moves both is
// a disturbed rule and a red that moves only the ESC cell is this defect.
// ===========================================================================

/** The eight positions where the rename row fires, plus the withheld ninth. */
function positionCells(label: string, type: string, expected: readonly Exp[]): Cell[] {
  return [
    { cell: `a1 ${label} @<T> annotation root`, src: annotSrc(type), expected },
    { cell: `a2 ${label} let annotation`, src: body(`let x: ${type} = 1`), expected },
    { cell: `a3 ${label} schema body field`, src: body(`schema S { p: ${type} }`), expected },
    { cell: `a4 ${label} fn parameter`, src: body(`fn f(p: ${type}) { 1 }`), expected },
    { cell: `a5 ${label} fn return`, src: body(`fn f(): ${type} { 1 }`), expected },
    { cell: `a6 ${label} nested body`, src: annotSrc(`{q: ${type}}`), expected },
    { cell: `a7 ${label} params: field`, src: paramsSrc(`  p: '${type}'`), expected },
    {
      cell: `a8 ${label} .thetalib fn parameter`,
      src: `fn f(p: ${type}) { 1 }\n`,
      path: "bug0229.thetalib",
      expected,
    },
    // a9 — the generic-argument carve-out all four raw-key rows share
    // (src/parser/type-grammar.ts:1031): the lowering never divides that
    // interior into fields, so no property name is minted there for a row to
    // name. The control is silent here too, which is what makes this a gate
    // rather than an exception.
    { cell: `a9 ${label} generic argument`, src: annotSrc(`array<${type}>`), expected: [] },
  ];
}

function positionRows(): Cell[] {
  return [
    ...positionCells("ESC", ESC, [REN(ESC_IDENT)]),
    ...positionCells("CTL", CTL, [REN("a")]),
  ];
}

/** §Reproduction (A) rows A10–A14, at the annotation root and at `params:`. */
function spellingRows(): Cell[] {
  return [
    { cell: "a10 two fields, escaped first", src: annotSrc(ESC_TWO), expected: [REN(ESC_IDENT)] },
    {
      cell: "a10 two fields, escaped first (params:)",
      src: paramsSrc(`  p: '${ESC_TWO}'`),
      expected: [REN(ESC_IDENT)],
    },
    { cell: "a11 two fields, escaped last", src: annotSrc(ESC_TWO_REV), expected: [REN(ESC_IDENT)] },
    {
      cell: "a11 two fields, escaped last (params:)",
      src: paramsSrc(`  p: '${ESC_TWO_REV}'`),
      expected: [REN(ESC_IDENT)],
    },
    // a12 — the quote-led key with the same escape is bug 0176's row's subject,
    // and that row renders the RAW key, so the escape appears in the message.
    { cell: "a12 quote-led key", src: annotSrc(ESC_QUOTED), expected: [QUOTED(ESC_QUOTED_KEY)] },
    {
      cell: "a12 quote-led key (params:)",
      src: paramsSrc(`  p: '${ESC_QUOTED}'`),
      expected: [QUOTED(ESC_QUOTED_KEY)],
    },
    // a13 — the single-quoted rename. An inner `'` survives a single-quoted
    // YAML scalar by doubling (`''`), so the `params:` twin below writes the
    // same interior with the outer quote and both interior quotes doubled.
    { cell: "a13 single-quoted rename", src: annotSrc(ESC_SINGLE), expected: [REN(ESC_IDENT)] },
    {
      cell: "a13 single-quoted rename (params:)",
      src: paramsSrc(`  p: '${ESC_SINGLE_YAML}'`),
      expected: [REN(ESC_IDENT)],
    },
    // a14 — one spelling twice is bug 0052's row's subject ALONE, whose
    // precedence is first of the four; it renders the raw key.
    { cell: "a14 repeated key", src: annotSrc(ESC_DUP), expected: [DUP(ESC_KEY)] },
    {
      cell: "a14 repeated key (params:)",
      src: paramsSrc(`  p: '${ESC_DUP}'`),
      expected: [DUP(ESC_KEY)],
    },
  ];
}

// ===========================================================================
// (B) §Reproduction (B) — `theta/parse/unresolved-named-type` is drawn from the
// lowering's own sink, so it separates "the field was judged" from "the field
// was never seen". Measured at the annotation root, where the sink's position
// list admits the type; a `params:` twin would measure that list instead.
// ===========================================================================

function unresolvedRows(): Cell[] {
  return [
    {
      cell: "b1 escaped rename over an unresolved type",
      src: annotSrc('{a as "w\\"x": Cat}'),
      expected: [REN(ESC_IDENT), UNRESOLVED("Cat")],
    },
    { cell: "b2 control plain field", src: annotSrc("{b: Cat}"), expected: [UNRESOLVED("Cat")] },
    {
      cell: "b3 control unescaped rename",
      src: annotSrc('{a as "w": Cat}'),
      expected: [REN("a"), UNRESOLVED("Cat")],
    },
    {
      cell: "b4 escaped rename beside a plain field",
      src: annotSrc('{a as "w\\"x": Cat, b: integer}'),
      expected: [REN(ESC_IDENT), UNRESOLVED("Cat")],
    },
    {
      cell: "b5 escaped quote-led key over an unresolved type",
      src: annotSrc('{"w\\"x": Cat}'),
      expected: [QUOTED(ESC_QUOTED_KEY), UNRESOLVED("Cat")],
    },
  ];
}

/** The whole diagnostic-list inventory, in group order. */
function allCells(): Cell[] {
  return [...positionRows(), ...spellingRows(), ...unresolvedRows()];
}

/** Declared inventory size — cell F1 recomputes it (anti-vacuity). */
const TOTAL_LIST_CELLS = 33;
/** Declared count of cells naming the rename row — cell F1 recomputes it. */
const RENAME_LIST_CELLS = 25;

describe("bug 0229 (A) — the escaped wire name is refused wherever the unescaped one is", () => {
  it("RED A1: the eight refusing positions and the withheld generic argument, ESC beside CTL", () => {
    expectGroup(
      positionRows(),
      "A1 — grammar.md:109 makes the inline field the object-schema `Field` form and admits the " +
        "rename on it; lexical.md:13's string-literal grammar admits `\\\"` inside the wire " +
        "name, so the escaped spelling IS that form. A red on an ESC cell alone is bug 0229: " +
        "the entry spelled a colon the scan did not see. A red that moves the CTL twin too means " +
        "the rename row itself was disturbed, which this route does not touch",
    );
  });

  it("RED A2: the four further spellings, at the annotation root and at `params:`", () => {
    expectGroup(
      spellingRows(),
      "A2 — one escape-blind colon scan takes three landed rows out of play at once, so an " +
        "escape-aware scan returns a key to all three: the rename row for a10/a11/a13, bug " +
        "0176's quote-led row for a12, bug 0052's repeat row for a14. A red that names the wrong " +
        "row means the four-way precedence at code-registry-parse.md:100–101 moved",
    );
  });
});

describe("bug 0229 (B) — the field's own type is lowered, so the unresolved sink speaks", () => {
  it("RED B1: the unresolved-sink pair, whole ordered lists", () => {
    expectGroup(
      unresolvedRows(),
      "B1 — the sink fires only when the entry's type reaches the lowering. b3 is the shape b1 " +
        "must take: the spelling is refused AND its type is lowered, in that order. b2 proves " +
        "the sink is reachable at this position, so a red on b1 is the field never being seen",
    );
  });
});

// ===========================================================================
// (C) §Reproduction (C) — what the lowering mints. Direct lowerer calls, so the
// bytes are asserted at the seam that produces them rather than through a load
// that the refusal now closes. Constraint 1: the property name is the raw
// pre-colon key, which is exactly what the three rows above render.
// ===========================================================================

/** The escaped entry's own fragment, keyed on its raw pre-colon text. */
const ESC_FRAGMENT = {
  type: "object",
  properties: { 'a as "w\\"x"': { type: "integer" } },
  required: ['a as "w\\"x"'],
  additionalProperties: false,
} as const;

/** The `$defs` name the hoisting positions mint for it (schema-subset.md:73). */
const ESC_SLUG = "__inline_68a87e995fbc02c1";

/** The two-field fragment, whose bytes must differ from the one-field control's. */
const ESC_TWO_FRAGMENT = {
  type: "object",
  properties: { 'a as "w\\"x"': { type: "integer" }, b: { type: "integer" } },
  required: ['a as "w\\"x"', "b"],
  additionalProperties: false,
} as const;

/** The one-field control the two-field source is byte-identical to at HEAD. */
const B_ONLY_FRAGMENT = {
  type: "object",
  properties: { b: { type: "integer" } },
  required: ["b"],
  additionalProperties: false,
} as const;

/** The slug `{b: integer}` alone mints, unmoved by this route. */
const B_ONLY_SLUG = "__inline_8cc8cb1e7074a3af";

describe("bug 0229 (C) — the lowered artefact carries the field the author wrote", () => {
  it("RED C1: the annotation root and the `params:` fragment both carry the escaped key", () => {
    expect(
      lowerQueryResponseSchema(ESC, [], []),
      "C1 — schema-subset.md:78 keys `properties` by wire names and puts every one of them in " +
        "`required`, and grammar.md:109 makes each inline field required by default. A red here " +
        "showing an empty `properties` is the silent deletion: `hoistInlineObjectType` skipped " +
        "the keyless entry (src/parser/params.ts:1267–1270)",
    ).toEqual(ESC_FRAGMENT);

    const esc = paramsFragment(ESC);
    expect(
      esc.fragment,
      "C1 — at `params:` the entry hoists to a `$ref` instead of collapsing to the permissive " +
        "`{}` the `required.length === 0` arm returns (src/parser/params.ts:1281–1283). A `{}` " +
        "here is a declared parameter that accepts any JSON at all",
    ).toEqual({ $ref: `#/$defs/${ESC_SLUG}` });
    expect(esc.defs, "C1 — and the hoisted member carries the same bytes").toEqual({
      [ESC_SLUG]: ESC_FRAGMENT,
    });
    expect(esc.unresolved, "C1 — a rename resolves no named type").toEqual([]);
  });

  it("RED C2: the quote-led and single-quoted escapes mint their own raw keys", () => {
    expect(
      lowerQueryResponseSchema(ESC_QUOTED, [], []),
      "C2 — the raw-key adjudication is landed law (§Non-goals): the key is the pre-colon text " +
        "verbatim, so a quote-led key is minted as written. This is the byte the quoted row " +
        "names in cell a12, which is the agreement-by-construction constraint 1 demands",
    ).toEqual({
      type: "object",
      properties: { '"w\\"x"': { type: "integer" } },
      required: ['"w\\"x"'],
      additionalProperties: false,
    });
    expect(
      lowerQueryResponseSchema(ESC_SINGLE, [], []),
      "C3 — the single-quoted spelling is the same statement with the other quote character",
    ).toEqual({
      type: "object",
      properties: { "a as 'w\\'x'": { type: "integer" } },
      required: ["a as 'w\\'x'"],
      additionalProperties: false,
    });
  });

  it("RED C3: two fields lower to two properties, and are NOT the one-field source's bytes", () => {
    const two = lowerQueryResponseSchema(ESC_TWO, [], []);
    const one = lowerQueryResponseSchema("{b: integer}", [], []);
    expect(
      two,
      "C3 — the two-field source's own bytes: both keys in `properties`, both in `required`, in " +
        "source order",
    ).toEqual(ESC_TWO_FRAGMENT);
    expect(one, "C3 — the one-field control, unmoved by this route").toEqual(B_ONLY_FRAGMENT);
    expect(
      two,
      "C3 — THE SHARPEST FORM OF THE CLAIM: a source with two fields and a source with one " +
        "field must not lower to the same bytes. Equality here means nothing downstream can tell " +
        "the two apart, so no later check can recover the loss",
    ).not.toEqual(one);
  });

  it("RED C4: the `$defs` slug of the two-field source differs from the one-field control's", () => {
    const two = paramsFragment(ESC_TWO);
    const one = paramsFragment("{b: integer}");
    expect(
      one.fragment,
      "C4 — the control's slug is content-addressed over its own fragment and is unmoved",
    ).toEqual({ $ref: `#/$defs/${B_ONLY_SLUG}` });
    expect(one.defs, "C4 — with the control's member bytes").toEqual({
      [B_ONLY_SLUG]: B_ONLY_FRAGMENT,
    });
    expect(
      Object.keys(two.defs),
      "C4 — the two-field source hoists exactly one member of its own",
    ).toHaveLength(1);
    expect(
      Object.values(two.defs)[0],
      "C4 — whose bytes are the two-field fragment",
    ).toEqual(ESC_TWO_FRAGMENT);
    expect(
      Object.keys(two.defs)[0],
      "C4 — and whose slug therefore differs from the control's. A shared slug is the identity " +
        "claim: the hash addresses a fragment that genuinely lost the field",
    ).not.toBe(B_ONLY_SLUG);
  });

  it("CONTROL C5: the unescaped rename's bytes, unmoved", () => {
    expect(
      lowerQueryResponseSchema(CTL, [], []),
      "C5 — the control the escaped cells are measured against: one character shorter, one " +
        "property, keyed on its own raw pre-colon text. A red here means a lowerer moved, which " +
        "this route does not touch — it changes which entries spell a key, not how a key is " +
        "minted",
    ).toEqual({
      type: "object",
      properties: { 'a as "w"': { type: "integer" } },
      required: ['a as "w"'],
      additionalProperties: false,
    });
  });
});

// ===========================================================================
// (D) §Reproduction (D) — the token-joined reconstructions, as DIRECT lowerer
// inputs. Bug 0228's fix makes an inline object's brace group a raw slice of the
// author's source at every `Type` position, so no document position produces
// these joins any more; they are exercised here because the colon scan is
// shared and must answer the same way whatever text reaches it.
// ===========================================================================

describe("bug 0229 (D) — the token-joined spellings answer the same way", () => {
  it("RED D1: the escaped join keeps its property; the unescapable join stays permissive", () => {
    expect(
      lowerQueryResponseSchema('{aas"w\\"x":integer}', [], []),
      "D1 — the escape is what the colon scan must honour, not the spaces around `as`: with the " +
        "backslash arm the entry spells the key `aas\"w\\\"x\"` and mints it. An empty " +
        "`properties` here is the same skip one character-class to the side",
    ).toEqual({
      type: "object",
      properties: { 'aas"w\\"x"': { type: "integer" } },
      required: ['aas"w\\"x"'],
      additionalProperties: false,
    });
    expect(
      lowerQueryResponseSchema('{aas"w"x":integer}', [], []),
      "D2 — CONTROL: with no backslash the second `\"` closes the literal, the third opens one " +
        "the entry never closes, and the entry genuinely spells no key. That case is unchanged " +
        "by the backslash arm and stays permissive",
    ).toEqual({});
  });
});

// ===========================================================================
// (E) End-to-end at `params:` — the reach. A refused `params:` type withholds
// the whole frontmatter, so no lowered schema keyed on the escaped text reaches
// the binder envelope. The pre-fix artefacts are the harm: a permissive `{}`
// for the one-field source and a field-losing `$ref` for the two-field one.
// ===========================================================================

/** The lowered `params:` schema as a consumer reads it off the document. */
function paramsLoweredSchema(type: string): unknown {
  const fm = parseDoc(paramsSrc(`  p: '${type}'`), "bug0229.theta").frontmatter as
    | { readonly params?: { readonly loweredSchema?: unknown } | null }
    | null;
  if (fm === null) {
    return null;
  }
  return fm.params?.loweredSchema ?? null;
}

describe("bug 0229 (E) — a refused `params:` type mints no lowered schema", () => {
  it("RED E1: neither escaped `params:` source is lowered, and the controls bracket the claim", () => {
    expect(
      {
        esc: paramsLoweredSchema(ESC),
        escTwo: paramsLoweredSchema(ESC_TWO),
        ctl: paramsLoweredSchema(CTL),
      },
      "E1 — §Expected: either the input is refused and nothing is lowered, or the field appears. " +
        "The `ctl` cell is the shape the two escaped cells must take, green at HEAD. A red " +
        "showing `{}` for `esc` is the permissive parameter the model is handed; a red showing a " +
        "`$ref` for `escTwo` is the field-losing artefact",
    ).toEqual({ esc: null, escTwo: null, ctl: null });
    expect(
      paramsLoweredSchema("{b: integer}"),
      "E1 — while a clean inline type still lowers, so the nulls above cannot be a broken harness",
    ).not.toBeNull();
  });
});

// ===========================================================================
// (F) THE INVENTORY ITSELF — anti-vacuity, and the registry-independent
// restatement of every diagnostic cell.
// ===========================================================================

describe("bug 0229 (F) — the inventory is counted, and asserted again without the registry", () => {
  it("CONTROL F1: 33 diagnostic-list cells, 25 of them naming the rename row", () => {
    const cells = allCells();
    expect(
      cells.length,
      "F1 — the declared inventory size. A cell deleted or a group dropped moves this count, so " +
        "the file cannot shrink unnoticed",
    ).toBe(TOTAL_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.some((e) => e.code === RENAMED_INLINE)).length,
      `F1 — the declared count of cells naming ${RENAMED_INLINE}. A cell weakened to \`[]\` to ` +
        "buy green would move this count, which is what makes the red set non-vacuous",
    ).toBe(RENAME_LIST_CELLS);
    expect(
      cells.filter((c) => c.expected.length === 0).map((c) => c.cell),
      "F1 — the only cells allowed to expect nothing are the two generic-argument withholds, " +
        "which are the shared gate at src/parser/type-grammar.ts:1031 and not an exception to it",
    ).toEqual(["a9 ESC generic argument", "a9 CTL generic argument"]);
    expect(
      new Set(cells.map((c) => `${c.cell} :: ${c.src}`)).size,
      "F1 — every cell key is distinct, so no whole-map equality silently drops a row",
    ).toBe(cells.length);
  });

  it("RED F2: the whole inventory at CODE level — the silence signature, no registry oracle", () => {
    // The registry-independent restatement of groups (A) and (B). Every red
    // here is a MISSING code where a refusal is owed, which is the
    // silence-instead-of-refusal signature the report measures; it cannot be a
    // message-wording failure, because no template is consulted.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const c of allCells()) {
      const key = `${c.cell} :: ${c.src}`;
      actual[key] = codes(c.src, c.path);
      expected[key] = codesOf(c.expected);
    }
    expect(
      actual,
      "F2 — read this cell first on a red: a missing entry is the defect (the entry spelled no " +
        "key, so no row judged it); an extra or reordered entry is an over-reach or a precedence " +
        "error among the four raw-key rows",
    ).toEqual(expected);
  });
});
