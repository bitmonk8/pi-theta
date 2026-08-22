import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { buildBodyTypeSchemas } from "../src/parser/body-type-lowering";
import { lowerParamsFieldType, type LowerCtx } from "../src/parser/params";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { respondToolWireSchema } from "../src/runtime/respond-tool-wire";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0160 — `docs/spec_topics/grammar.md:109` assigns
// `theta/parse/wire-name-collision` and `theta/parse/redundant-wire-name`
// "within the one inline object", but `TypeParser.parseObject`
// (src/parser/type-grammar.ts:603) reads the field-name token and then requires
// `:` (:639, the tolerant `break`), while the function's only `as` handling sits
// AFTER the field type — so no `Type` position parses the inline rename, neither
// assigned code can fire there, and `{a as "w": integer, b as "w": string}`
// loads with zero diagnostics at every position and lowers property names
// containing a `"` character that no author wrote
// (docs/bugs/0160-inline-object-wire-name-rename-unparsed.md).
// This file is that report's witness.
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (settled before it was written)
// =====================================================================
// 0160 §Fix (a) **route 2**, in the disposition §Fix (a) demands be stated:
// it does NOT parse the rename out of the key — it REFUSES the inline rename
// spelling. §Fix (b): NO lowering change; both lowerers keep the pre-colon text
// they key on today, and the fix makes those bytes unreachable through a load
// instead of rewriting them. §Fix (c): the third enumerated option — "refuse the
// inline rename outright under a third code" — so
// `theta/parse/wire-name-collision` and `theta/parse/redundant-wire-name` stay
// DECLARATION-ONLY and the `<schema>` placeholder problem those two rows carry
// never arises.
//
// The new registry row (E, parse):
//   code    `theta/parse/renamed-inline-field-name`
//   Message `wire-name rename on field '<field>' within one inline object type`
// `<field>` renders the theta-side IDENTIFIER under the STANDARD identifier
// rendering (docs/spec_topics/diagnostics/placeholder-rendering-b.md:10,
// category 5, "identifier-shaped per Lexical — Identifiers; rendered
// unquoted") — deliberately NOT a third row-scoped carve-out beside the two
// that page already grants `theta/parse/duplicate-inline-field-name` and
// `theta/parse/quoted-inline-field-name`. Cell A1 makes that a falsifiable
// claim about the page.
//
// Detection site: `walkType`'s `object` arm (src/parser/type-grammar.ts:872),
// inside the existing `inlineObjectFieldKeys` raw-key loop (:718, the landed
// bug 0159 route-(a) key: `splitTopLevel(interiorSource, ",",
// "angle-and-brace")` + `topLevelColon`, raw, trimmed, unnormalised), in the
// NON-REPEATING branch, AFTER the bug 0176 first-char-quote test (:1039), which
// `continue`s. Precedence, therefore:
//   1. a REPEATING key is `theta/parse/duplicate-inline-field-name`'s alone;
//   2. a key whose FIRST character is a quote is
//      `theta/parse/quoted-inline-field-name`'s alone;
//   3. only then this row.
// Gate inherited byte-for-byte from the two neighbours: `node.closingBraceSpelled`
// alone (bug 0233 dropped the loop's other, narrower `!insideGenericArgument`
// half, so this row now answers alike at every depth beneath a generic
// argument).
//
// Predicate over the raw key, verified by scratch probe before this file was
// written: /^([A-Za-z_][A-Za-z0-9_]*?)\s*as\s*(?:"[^"]*"|'[^']*')$/ — capture
// group 1 is the rendered `<field>`.
//
// WHY A PARSE-LEVEL ROUTE WAS REJECTED, AND WHY THIS ROW RENDERS THE
// THETA-SIDE IDENTIFIER RATHER THAN THE RAW KEY (re-verified here by probe,
// not inherited):
// before bug 0228's fix, at ten of the eleven `Type` positions the document
// reconstructed the type source by joining lexer tokens with no separator, so
// `{a as "w": integer}` reached both the checker and the lowerer as
// `{aas"w":integer}` and the raw key was `aas"w"`; `params:` alone passed its
// YAML scalar through and kept `a as "w"`. Rendering the pattern's captured
// GROUP rather than the raw key was load-bearing then: the predicate matches
// both spellings and yields `a` from both, which was what let this row answer
// alike at all eleven positions despite the captures disagreeing
// (docs/spec_topics/type-system.md:15). Bug 0228's fix makes an inline
// object's brace group a raw slice of the author's own source bytes at every
// position, so the raw key now agrees with the author's spelling everywhere
// too — the reason to render the identifier instead of the raw key is no
// longer that agreement, it is that the identifier IS this row's subject: the
// theta-side name a rename is written on, not the raw key a rename clause
// happens to spell. Group (C) pins both spellings' subject as the same
// identifier; group (E) row e1 exhibits the (now-agreeing) raw keys directly
// through the neighbour row's own rendered subject.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:101 — `ObjectType ::= "{" Field ("," Field)*
//     ","? "}"`, `Field` per Schema Declarations; :109 — the sentence naming the
//     `as "WireName"` rename among an inline object's field semantics and
//     assigning the two wire-name diagnostics "within the one inline object".
//   - docs/spec_topics/schemas.md:17 — "Field names are identifiers"; :23 — the
//     rename sits BETWEEN the field identifier and its type, which is the form
//     no inline position parses; :39 — the rename is "the only mechanism" for a
//     property name that is not theta-identifier-compatible; :44 — the collision
//     rule; :45 — the redundant-rename rule.
//   - docs/spec_topics/lexical.md:13 — `[A-Za-z_][A-Za-z0-9_]*`, which admits
//     neither a space nor a quote character: this is why the keys group (D)
//     measures are unreachable from theta, and why the predicate's capture group
//     is the only identifier in the entry.
//   - docs/spec_topics/type-system.md:15 — one type grammar in every annotation
//     position, the claim group (C)'s eleven cells make falsifiable.
//   - docs/spec_topics/schema-subset.md:78 — `properties` is keyed by wire
//     names, which the pre-colon keys of group (D) are not.
//   - DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md:72) — the
//     registry is closed; the new row lands in the same commit as the code. Cell
//     A0 is that obligation made falsifiable.
//   - DIAG-4 (:74) — the *Message* column is normative and tests MUST source it
//     from the registry. Every expected message here is read out of
//     docs/spec_topics/diagnostics/ through `registryMessage`; no message prose
//     is copied.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:90 / :91 — the two
//     rows that stay DECLARATION-ONLY under this route (group (B) controls);
//     :93 / :94 — the two neighbour rows whose precedence group (G) pins.
//   - docs/spec_topics/governance/source-language-stability.md:5 — GOV-15; :7 —
//     the loads-cleanly predicate group (C) reads; :23 — the
//     diagnostic-registry carve-out, addition arm, which dispositions every
//     newly-refused spelling this file enumerates.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts this kind of claim in, and the tier above it would add nothing. Every
// claim settles inside one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39, the shipped load path behind the standard inert
// `parseDeps` double), one direct lowerer call (`lowerQueryResponseSchema`
// src/runtime/query-schema-lowering.ts:153, `buildBodyTypeSchemas`
// src/parser/body-type-lowering.ts:428, `lowerParamsFieldType`
// src/parser/params.ts), one `respondToolWireSchema`
// (src/runtime/respond-tool-wire.ts:92) or one real `AjvSchemaValidator.compile`
// (src/seams/schema-validator.ts:390, `#build` at :441). Two live halves cover
// the registration-facing surface this tier cannot reach —
// tests/live/inline-object-wire-name-rename-live-cell.test.ts (H8a) and
// tests/live/acceptance/inline-object-wire-name-rename-load-refusal.test.ts
// (H9a) — and they cover only that.
//
// WHAT IS RED HERE, derived before it was measured: cell A0 (no such registry
// row yet); group (B)'s three inline rows; group (C)'s twenty-two position cells
// and their registration/frontmatter-gate consequences; group (F)'s eight
// suppression rows and its `params:` cause row; group (G)'s twelve
// rename-bearing boundary rows. Groups (D), (E), (H), every declaration control
// in (B), every control in (F) and the seven silent/neighbour-owned rows of (G)
// are CONTROLS: green now and green after. A red in (D) or (E) means a lowerer
// or the AJV seam moved rather than the parse gate — §Fix (b) changes neither; a
// red in (B)'s declaration rows means `checkObjectSchema` was touched, which
// this route does not do; a red in (G)'s neighbour rows means the precedence
// above was implemented in the wrong order.
//
// SINCE BUG 0231 (route 1, `parseObject`'s field loop resynchronising at a
// malformed entry's next `,` instead of ending the field list there): a field
// written BEHIND an inline rename now reaches `fieldTypes`, so cells f1, f3,
// f5, f7, f9, f15, f16 and g18 each gain the sibling verdict their own
// single-field control already drew, ALONGSIDE this row's rename refusal —
// which still fires first, since it is a raw-key-loop emission and the
// raw-key loop always runs ahead of the `fieldTypes` recursion. No cell here
// loses a line; every previously-expected line stays, in order.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. The
// registry lookup asserts its row's presence and its placeholder before any
// template is used, so a missing or reworded row reds by naming the registry;
// every diagnostic cell asserts its whole UNFILTERED ordered list, so an absent
// emission can never read as a pass; and every group is asserted a second time
// at CODE level with no registry dependency at all (cell H2), so the
// silence-instead-of-refusal signature is witnessed even while the registry half
// of the fix is outstanding.
//
// ANTI-VACUITY: the diagnostic-list inventory below is 67 cells, of which 47
// carry a non-empty expectation naming `theta/parse/renamed-inline-field-name`.
// Cell H1 recomputes both counts from the inventory itself and fails if either
// moves, so no cell can be quietly weakened to `[]` and no expectation can be
// dropped without the count witnessing it. Seven further cells assert artefact
// bytes (group (D)), five assert the duplicate family's outcomes (group (E)),
// and three assert registration / frontmatter observables (group (C)).

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

/** The third code §Fix (c) settles on: refuse the inline rename outright. */
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
/** The two rows that stay DECLARATION-ONLY under this route (:90, :91). */
const WIRE_COLLISION = "theta/parse/wire-name-collision";
const REDUNDANT_WIRE = "theta/parse/redundant-wire-name";
/** The two neighbour rows this row is subordinate to (:93, :94). */
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
/** Codes the suppression family's controls draw, and 0154's row. */
const VOID_NON_RETURN = "theta/parse/void-in-non-return-position";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const GENERIC_ARITY = "theta/parse/generic-arity-mismatch";
const RESULT_IN_SCHEMA = "theta/parse/result-in-schema-position";
const UNRESOLVED_NAMED = "theta/parse/unresolved-named-type";
const QUERY_ANNOT_NOT_EXPR = "theta/parse/query-annotation-type-not-expression";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const RESERVED_KEYWORD = "theta/parse/reserved-keyword-as-identifier";
// Bug 0228's fourth-and-last raw-key row, entailed into this file's boundary
// group (G): a key that is none of this row's own subject (repeat, quote-led,
// rename-shaped) and is not itself `Ident`-shaped now draws this row instead
// of staying silent.
const NOT_IDENTIFIER_INLINE = "theta/parse/inline-field-name-not-identifier";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so a
 * missing row or a reworded template reds by naming the registry rather than by
 * a bare `undefined` comparison.
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
 * The new row's rendering. `field` is the THETA-SIDE identifier the predicate's
 * capture group yields — `a` from both `a as "w"` and the token-joined
 * `aas"w"` — rendered unquoted under the standard `<field>` category
 * (placeholder-rendering-b.md:10); the row template's own single quotes delimit
 * it.
 */
function REN(field: string): Exp {
  return { severity: "error", code: RENAMED_INLINE, fills: [["<field>", field]] };
}
function DUP(key: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", key]] };
}
function QUOTED(key: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", key]] };
}
function COLLISION(name: string, schema: string): Exp {
  return {
    severity: "error",
    code: WIRE_COLLISION,
    fills: [
      ["<name>", name],
      ["<schema>", schema],
    ],
  };
}
function REDUNDANT(name: string): Exp {
  return { severity: "warning", code: REDUNDANT_WIRE, fills: [["<name>", name]] };
}
function VOIDEXP(): Exp {
  return { severity: "error", code: VOID_NON_RETURN, fills: [] };
}
function EMPTYBODY(subject: string): Exp {
  return { severity: "error", code: EMPTY_BODY, fills: [["<X>", subject]] };
}
function ARITY(ctor: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: GENERIC_ARITY,
    fills: [
      ["<ctor>", ctor],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
}
function RESULTEXP(): Exp {
  return { severity: "error", code: RESULT_IN_SCHEMA, fills: [] };
}
function UNRESOLVED(name: string): Exp {
  return { severity: "error", code: UNRESOLVED_NAMED, fills: [["<name>", name]] };
}
function QUERYNOTEXPR(): Exp {
  return { severity: "error", code: QUERY_ANNOT_NOT_EXPR, fills: [] };
}
function BINDINGCASE(): Exp {
  return { severity: "error", code: BINDING_CASE, fills: [] };
}
function RESERVED(keyword: string): Exp {
  return { severity: "error", code: RESERVED_KEYWORD, fills: [["<keyword>", keyword]] };
}
function NOTIDENT(key: string): Exp {
  return { severity: "error", code: NOT_IDENTIFIER_INLINE, fills: [["<field>", key]] };
}

// ===========================================================================
// Fixtures. One builder per `Type` position, in the vocabulary of the landed
// siblings (tests/inline-object-quoted-field-name-refusal.test.ts,
// tests/inline-object-field-name-comparison-key.test.ts). Every body fixture
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
 * as a SINGLE-quoted YAML scalar so an interior DOUBLE quote reaches the theta
 * type grammar intact — which is also why the single-quoted rename spelling
 * (group (G) row g6) is exercised at the annotation position only: a `'w'`
 * inside a single-quoted YAML scalar is a YAML-quoting artefact, not a theta
 * fact.
 */
function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — the position whose lowering IS the document root. */
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

/** The two-field rename fixture of 0160 §Reproduction (a) row G1 / (b). */
const REN2 = '{a as "w": integer, b as "w": string}';
/** The one-field rename fixture. */
const REN1 = '{a as "w": integer}';

// ===========================================================================
// Parse + assertion helpers.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "bug0160.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

function codes(src: string, path = "bug0160.theta"): string[] {
  return parseDoc(src, path).diagnostics.map((d) => d.code);
}

/**
 * GOV-15's loads-cleanly predicate
 * (source-language-stability.md:7): a source emitting no `E`-severity
 * diagnostic. This is the observable that separates "the author is told" from
 * "the artefact is minted and handed to the binder and the model".
 */
function registersCleanly(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some((d) => d.severity === "error");
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

// ===========================================================================
// THE DIAGNOSTIC-LIST INVENTORY. Every cell is one source, one whole ordered
// UNFILTERED expectation. Held as data so cell H1 can count it and cell H2 can
// re-assert all of it at CODE level with no registry dependency.
// ===========================================================================

interface Cell {
  readonly cell: string;
  readonly src: string;
  readonly path?: string;
  readonly expected: readonly Exp[];
}

/** The eleven `Type` positions, in the vocabulary of the landed siblings. */
const POSITION_LABELS = [
  "@<T> annotation root",
  "let annotation",
  "schema body field",
  "fn parameter",
  "fn return",
  "alias RHS",
  "params: field",
  "invoke<T>",
  "union arm",
  "nested one level",
  ".thetalib schema field",
] as const;

/** One inline type written at each of the eleven positions. */
function positionSources(type: string): ReadonlyArray<readonly [string, string, string]> {
  return [
    ["@<T> annotation root", annotSrc(type), "bug0160.theta"],
    ["let annotation", body(`let x: ${type} = 1`), "bug0160.theta"],
    ["schema body field", body(`schema S { p: ${type} }`), "bug0160.theta"],
    ["fn parameter", body(`fn f(p: ${type}) { 1 }`), "bug0160.theta"],
    ["fn return", body(`fn f(): ${type} { 1 }`), "bug0160.theta"],
    ["alias RHS", body(`schema S = ${type}`), "bug0160.theta"],
    ["params: field", paramsSrc(`  p: '${type}'`), "bug0160.theta"],
    ["invoke<T>", body(`let r = invoke<${type}>("./x.theta")`), "bug0160.theta"],
    ["union arm", annotSrc(`${type} | null`), "bug0160.theta"],
    ["nested one level", annotSrc(`{p: ${type}}`), "bug0160.theta"],
    [".thetalib schema field", `schema S { p: ${type} }\n`, "bug0160.thetalib"],
  ];
}

/** (B) §Reproduction (a) — the three inline rows the new row must draw. */
function inlineRows(): Cell[] {
  return [
    { cell: "b1 (G1)", src: annotSrc(REN2), expected: [REN("a"), REN("b")] },
    { cell: "b2 (G2)", src: body(`schema S { p: ${REN2} }`), expected: [REN("a"), REN("b")] },
    { cell: "b3 (G4)", src: annotSrc('{a as "a": integer}'), expected: [REN("a")] },
  ];
}

/** (B) §Reproduction (a) — the declaration controls, which must not move. */
function declRows(): Cell[] {
  return [
    {
      cell: "b4 (G3)",
      src: body('schema S { a as "w": integer, b as "w": string }'),
      expected: [COLLISION("w", "S")],
    },
    {
      cell: "b5 (G5)",
      src: body('schema S { a as "a": integer }'),
      expected: [REDUNDANT("a")],
    },
  ];
}

/** (C) §Reproduction (b) — the eleven positions, twice. */
function positionRows(): Cell[] {
  const out: Cell[] = [];
  for (const [label, src, path] of positionSources(REN2)) {
    out.push({ cell: `c1 ${label}`, src, path, expected: [REN("a"), REN("b")] });
  }
  for (const [label, src, path] of positionSources(REN1)) {
    out.push({ cell: `c2 ${label}`, src, path, expected: [REN("a")] });
  }
  return out;
}

/**
 * (F) §Reproduction (e) S1–S13 and §Reproduction (f) S14, re-measured at HEAD,
 * each paired with its control. Bug 0231 (route 1, `parseObject`'s field loop
 * resynchronises at a malformed entry's next `,` instead of ending the field
 * list) touches this family: a field written BEHIND a rename now reaches
 * `fieldTypes` and draws its own control's row alongside the rename refusal,
 * so S1/S3/S5/S7/S9 draw the new row AND what their controls draw, in that
 * order — the rename refusal is a raw-key-loop emission and always precedes
 * the fieldTypes recursion that carries the field-TYPE checks. The emission
 * ORDER of rows S11–S13 follows from the same detection site: `walkType`'s
 * `object` arm runs the raw-key loop BEFORE it recurses into `node.fieldTypes`
 * and before the lowering's own `unresolved-named-type` sink, which cells
 * f15–f17 establish at HEAD through the neighbour rows that already sit at
 * that site.
 */
function suppressionRows(): Cell[] {
  return [
    {
      cell: "f1 (S1)",
      src: body(`schema S { p: {a as "w": integer, b: void} }`),
      expected: [REN("a"), VOIDEXP()],
    },
    { cell: "f2 (S2 control)", src: body("schema S { p: {a: integer, b: void} }"), expected: [VOIDEXP()] },
    {
      cell: "f3 (S3)",
      src: body(`schema S { p: {a as "w": integer, b: {}} }`),
      expected: [REN("a"), EMPTYBODY("{}")],
    },
    { cell: "f4 (S4 control)", src: body("schema S { p: {a: integer, b: {}} }"), expected: [EMPTYBODY("{}")] },
    {
      cell: "f5 (S5)",
      src: body(`schema S { p: {a as "w": integer, b: array<integer,string>} }`),
      expected: [REN("a"), ARITY("array", "1", "2")],
    },
    {
      cell: "f6 (S6 control)",
      src: body("schema S { p: {a: integer, b: array<integer,string>} }"),
      expected: [ARITY("array", "1", "2")],
    },
    {
      cell: "f7 (S7)",
      src: body(`schema S { p: {a as "w": integer, b: Result<integer,string>} }`),
      expected: [REN("a"), RESULTEXP()],
    },
    {
      cell: "f8 (S8 control)",
      src: body("schema S { p: {a: integer, b: Result<integer,string>} }"),
      expected: [RESULTEXP()],
    },
    {
      cell: "f9 (S9)",
      src: annotSrc(`{p: {a as "w": integer}, q: {c: 1, c: 2}}`),
      expected: [REN("a"), DUP("c")],
    },
    {
      cell: "f10 (S10 control)",
      src: annotSrc("{p: {a: integer}, q: {c: 1, c: 2}}"),
      expected: [DUP("c")],
    },
    {
      cell: "f11 (S11)",
      src: body(`schema S { p: {b: void, a as "w": integer} }`),
      expected: [REN("a"), VOIDEXP()],
    },
    {
      cell: "f12 (S12)",
      src: body(`schema S { p: {a as "w": integer}, q: void }`),
      expected: [REN("a"), VOIDEXP()],
    },
    {
      cell: "f13 (S13)",
      src: annotSrc(`{a as "w": integer, b: Cat}`),
      expected: [REN("a"), UNRESOLVED("Cat")],
    },
    // f14 (S14) — the over-reach tripwire. The post-type spelling's raw key is
    // the bare identifier `a`, so the predicate does not match it and the new
    // row must stay silent; the `as` skip AFTER the field type
    // (type-grammar.ts, inside `parseObject`) is untouched by decision
    // (0160 §Non-goals). The expectation is what HEAD measures, which is NOT
    // 0160 §Reproduction (f)'s `[]` — the code-level restatement in cell H2
    // carries the same measurement without the registry oracle.
    { cell: "f14 (S14)", src: annotSrc(`{a: integer as "w"}`), expected: [QUERYNOTEXPR()] },
    // f15–f17 — the suppression's former CAUSE, still measured for the record.
    // Bug 0231 (route 1) resynchronises `parseObject`'s field loop at a
    // malformed entry's next `,` rather than ending the field list there, so
    // `void` behind the malformed head is no longer discarded: f15 gains
    // `void-in-non-return-position` beside the quoted-key row (no `as`
    // anywhere, no rename — the fix is at the field loop, not at any
    // rename-specific site) and f16 gains it beside the rename row too, at
    // `params:` where the raw spelling `a as "w"` was always intact. The
    // suppression's cause was `parseObject`'s field loop failing to
    // resynchronise past `Ident` with no `:` behind it; bug 0231 is that fix.
    {
      cell: "f15 (cause: quoted-key analogue)",
      src: body(`schema S { p: {"a": string, b: void} }`),
      expected: [QUOTED('"a"'), VOIDEXP()],
    },
    {
      cell: "f16 (cause: params: raw spelling)",
      src: paramsSrc(`  p: '{a as "w": integer, b: void}'`),
      expected: [REN("a"), VOIDEXP()],
    },
    {
      cell: "f17 (cause: params: control)",
      src: paramsSrc(`  p: '{a: integer, b: void}'`),
      expected: [VOIDEXP()],
    },
  ];
}

/**
 * (G) Boundary cells, each MEASURED at HEAD before it was written down, never
 * assumed. Rows g1–g5, g9 and g15 are neighbour-owned or silent-by-design and
 * are green in both directions; the rest carry the new row.
 */
function boundaryRows(): Cell[] {
  return [
    // g1 — a non-identifier key that is NOT a rename. THIS row's predicate
    // does not match it, and 0160 claims nothing for it (0176's
    // non-identifier-key residual owns the class). Since bug 0228's fix,
    // though, the key `a"b"` is not `Ident`-shaped either, and that report's
    // own row — fourth and last in the precedence, after this file's rename
    // row — now names it: the cell's SUBJECT (this row stays silent on a
    // non-rename key) is unmoved, but the shape is no longer admitted overall.
    { cell: "g1", src: annotSrc('{a"b": string}'), expected: [NOTIDENT('a"b"')] },
    // g2 — bug 0176's row alone: the first character is a quote, so the
    // first-char test `continue`s before this row is reached.
    { cell: "g2", src: annotSrc('{"a": string}'), expected: [QUOTED('"a"')] },
    // g3 — a REPEATING rename key is bug 0159's row ALONE, with no line from
    // this one. Since bug 0228's fix the rendered subject is the author's own
    // raw key at every position, not a token-joined one — this cell no longer
    // needs a `params:`-versus-the-rest split to make its point.
    {
      cell: "g3",
      src: annotSrc('{a as "w": string, a as "w": integer}'),
      expected: [DUP('a as "w"')],
    },
    // g4 — RE-PINNED for bug 0233
    // (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md):
    // the generic-argument gate this row inherited from bug 0052 is gone from
    // `walkType`'s raw-key loop, so the rename clause inside a generic
    // argument is now refused exactly as it is at any other position. The
    // LOWERING still never divides that interior into fields (CONTROL G3
    // below), which bounds the wire consequence, not whether the source is
    // judged.
    { cell: "g4", src: annotSrc('array<{a as "w": string}>'), expected: [REN("a")] },
    // g5 — an interior that never closes spells no `ObjectType`, so
    // `closingBraceSpelled` withholds the row.
    { cell: "g5", src: annotSrc('{a as "w": string'), expected: [] },
    // g6 — the single-quoted wire name. Annotation position only (see
    // `paramsSrc`'s doc comment).
    { cell: "g6", src: annotSrc("{a as 'w': string}"), expected: [REN("a")] },
    // g7 — schemas.md:23's own PascalCase example written inline. schemas.md:39
    // calls the rename "the only mechanism" for such a property name; under
    // this route the inline spelling is refused and the author is told to
    // declare the schema, rather than silently getting a key no author wrote.
    {
      cell: "g7",
      src: annotSrc('{first_name as "FirstName": string}'),
      expected: [REN("first_name")],
    },
    // g8 — bug 0154's row w2. The new row fires; `binding-case-mismatch` still
    // does NOT, and that is pinned WITH its cause: 0154's pass reads
    // `TypeNode.fieldNames`, and `Ys` never enters that list because
    // `parseObject`'s field loop breaks at the rename before
    // `fieldNames.push` (0154 §Fix Residual 1, measured not inferred).
    { cell: "g8", src: annotSrc('{Ys as "w": string}'), expected: [REN("Ys")] },
    // g9 — 0154's row at the plain spelling, unmoved: the identifier pass reads
    // a different list and this route does not touch it.
    { cell: "g9", src: annotSrc("{Ys: string}"), expected: [BINDINGCASE()] },
    // g10 / g11 — the precedence is per-KEY and the order is SOURCE order, so
    // the two rows interleave rather than one shadowing the other.
    {
      cell: "g10",
      src: annotSrc('{a as "w": integer, "b": string}'),
      expected: [REN("a"), QUOTED('"b"')],
    },
    {
      cell: "g11",
      src: annotSrc('{"b": string, a as "w": integer}'),
      expected: [QUOTED('"b"'), REN("a")],
    },
    // g12 — two DIFFERENT wire names on one theta-side name: two distinct raw
    // keys, neither repeating, so bug 0159's row is silent (0052 *Residuals*
    // item 2's settled reading) and this row speaks twice, naming the same
    // identifier both times.
    {
      cell: "g12",
      src: annotSrc('{a as "w": integer, a as "x": string}'),
      expected: [REN("a"), REN("a")],
    },
    // g13 — a rename beside the plain spelling of the same theta name: two
    // distinct raw keys again, so one line, from the renamed entry only.
    {
      cell: "g13",
      src: annotSrc('{a as "w": integer, a: string}'),
      expected: [REN("a")],
    },
    // g14 — padding around the entry is absorbed by the key's `trim()`, and the
    // predicate's own `\s*` absorbs the rest.
    { cell: "g14", src: annotSrc('{ a as "w" : integer }'), expected: [REN("a")] },
    // g15 — an `as` with no string literal behind it is not a rename spelling:
    // THIS row's predicate requires the quoted wire name, so it stays silent.
    // Since bug 0228's fix the raw key `a as` is not `Ident`-shaped either
    // (it carries a space), so that report's own fourth-and-last row now
    // names it — this cell's subject (no rename here) is unmoved.
    { cell: "g15", src: annotSrc("{a as: integer}"), expected: [NOTIDENT("a as")] },
    // g16 — a leading-underscore theta name is an identifier
    // (lexical.md:13) and is rendered as written.
    { cell: "g16", src: annotSrc('{_a as "w": integer}'), expected: [REN("_a")] },
    // g17 — one line per offending key, in source order; the plain `c` entry
    // draws nothing.
    {
      cell: "g17",
      src: annotSrc('{a as "w": integer, b as "x": string, c: boolean}'),
      expected: [REN("a"), REN("b")],
    },
    // g18 — the outer object's TWO fields each carry their own single-entry
    // malformed body. Before bug 0231's fix `parseObject`'s outer loop broke
    // entirely once `p`'s own `as`-skip left it mid-entry, so `q` was never
    // parsed and never reached `fieldTypes` — this cell drew `a` alone. Bug
    // 0231 (route 1) resynchronises at each malformed entry's own closing `}`
    // instead, so the outer loop reads BOTH `p` and `q` as ordinary fields and
    // the walk descends into both nested bodies; each nested raw-key loop
    // draws its own rename line, in source order.
    {
      cell: "g18",
      src: annotSrc('{p: {a as "w": integer}, q: {b as "x": string}}'),
      expected: [REN("a"), REN("b")],
    },
    // g19 — the walk DOES descend into a rename-bearing body's own interior at
    // depth, measured at HEAD the same way.
    { cell: "g19", src: annotSrc('{p: {q: {a as "w": integer}}}'), expected: [REN("a")] },
    // g20 / g21 — a wire name carrying an ESCAPED quote, at the annotation
    // root and at `params:` alike. CLOSED by bug 0229: `topLevelColon`
    // (`params.ts`) was escape-blind while its sibling split,
    // `splitTopLevelSegments`, already consumed the backslash and the
    // character behind it — so the entry's `:` was never seen at top level
    // and the entry spelled no key. `topLevelColon` now shares the split's
    // escape handling and `INLINE_FIELD_RENAME`'s wire-name alternatives now
    // admit the escaped interior, so this row judges the entry the same way
    // it judges the unescaped control.
    { cell: "g20", src: annotSrc('{a as "w\\"x": integer}'), expected: [REN("a")] },
    { cell: "g21", src: paramsSrc('  p: \'{a as "w\\"x": integer}\''), expected: [REN("a")] },
    // g22 — a reserved-keyword-shaped theta-side name is INSIDE this row's
    // emission set, deliberately: this row's subject is the raw key the
    // lowering would mint as a property name, not an identifier binding, so it
    // inherits none of bug 0154's `RESERVED_KEYWORDS` exclusion. The
    // reserved-keyword row beside it is the tail of the same entry read as a
    // statement and is not this row's business; the pair is pinned whole so the
    // choice is falsifiable.
    {
      cell: "g22",
      src: annotSrc('{let as "w": integer}'),
      expected: [REN("let"), RESERVED("as")],
    },
    // g23 — a SECOND rename clause behind the first is trailing text, and
    // THIS row's predicate is anchored at both ends with the wire-name literal
    // at the end, so the whole entry matches nothing and this row alone stays
    // silent on it — that under-refusal-BY-THIS-ROW is what cell G4 still
    // pins in the lowered bytes. Since bug 0228's fix, though, the raw key
    // `a as "w" as "x"` is not `Ident`-shaped, so that report's own
    // fourth-and-last row now names it; the key still reaches the lowering
    // unrefused ONLY through the DIRECT construction cell G4 performs, not
    // through a load.
    { cell: "g23", src: annotSrc('{a as "w" as "x": integer}'), expected: [NOTIDENT('a as "w" as "x"')] },
  ];
}

/** The whole diagnostic-list inventory, in group order. */
function allCells(): Cell[] {
  return [
    ...inlineRows(),
    ...declRows(),
    ...positionRows(),
    ...suppressionRows(),
    ...boundaryRows(),
  ];
}

/** Declared inventory size — cell H1 recomputes it (anti-vacuity). */
const TOTAL_LIST_CELLS = 67;
/** Declared count of cells carrying the new row — cell H1 recomputes it. */
const NEW_ROW_LIST_CELLS = 50;

/**
 * One group's cells asserted as a whole-map equality: separate assertions would
 * stop at the first divergence and hide the rest, and the multiplicity /
 * precedence / ordering claims above are only meaningful against whole lists.
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
// RED at HEAD: A0. GREEN now and after: A1.
// ===========================================================================

describe("bug 0160 (A) — the third code the refusal route mints, and its placeholder", () => {
  it("RED A0: the registry carries `theta/parse/renamed-inline-field-name`, E, parse, with its normative Message", () => {
    const row = REGISTRY.find((r) => r.code === RENAMED_INLINE);
    expect(
      row,
      "A0 — docs/spec_topics/diagnostics/code-registry-parse.md must carry the " +
        `${RENAMED_INLINE} row; the registry is closed (DIAG-2, diagnostic-shape.md:72), so the ` +
        "row and the emission land in one commit. §Fix (c) settles on the THIRD enumerated " +
        "option — refuse the inline rename outright under a third code — which is why " +
        `${WIRE_COLLISION} and ${REDUNDANT_WIRE} are not widened and their <schema> placeholder ` +
        "problem never arises",
    ).toBeDefined();
    expect(
      row?.severity,
      "A0 — severity E: the input is refused, not warned. The declaration spelling's own " +
        `warning row (${REDUNDANT_WIRE}, W) is untouched by this route`,
    ).toBe("E");
    expect(
      row?.namespace,
      "A0 — area/namespace `parse`: the detection site is `walkType`'s object arm " +
        "(src/parser/type-grammar.ts:872), reached from the parser",
    ).toBe("parse");
    expect(
      registryMessage(REGISTRY, RENAMED_INLINE),
      "A0 — the *Message* is normative (DIAG-4, diagnostic-shape.md:74). The subject is the " +
        "THETA-SIDE identifier the rename is written on, not the raw key, which is what makes " +
        "the row answer alike at the ten token-joining positions and at `params:`",
    ).toBe("wire-name rename on field '<field>' within one inline object type");
  });

  it("CONTROL A1: `<field>` keeps the standard identifier rendering — THREE row-scoped carve-outs, none of them this row's", () => {
    // placeholder-rendering-b.md:10 grants `<field>` a raw-text carve-out
    // because a row's subject is an inline entry's raw pre-colon text. This
    // row's own subject is an IDENTIFIER, so it takes category 5's default
    // rendering and this row is not among the carved-out ones.
    //
    // The carve-out COUNT is entailed by bug 0228, not by this report: that
    // fix mints `theta/parse/inline-field-name-not-identifier`, a FOURTH
    // raw-key-comparing row whose `<field>` also needs the carve-out (its
    // subject is the raw key too), so the sentence now excepts three rows
    // rather than two. This row (`theta/parse/renamed-inline-field-name`)
    // takes NO carve-out either way — its own subject was always the
    // theta-side identifier — so the control's real claim is unmoved: this
    // row is not one of the excepted ones.
    const page = readDiagnosticsPage("placeholder-rendering-b.md");
    expect(
      page,
      "A1 — the carve-out sentence now excepts exactly three rows (bug 0228 adds the fourth " +
        "raw-key row); a fix that added THIS row to it would be rendering a raw key rather than " +
        "the theta-side identifier, which is not the settled disposition",
    ).toContain("`<field>` renders this way on every row but three");
    expect(
      page.includes(RENAMED_INLINE),
      `A1 — ${RENAMED_INLINE} must NOT appear on placeholder-rendering-b.md: its <field> is ` +
        "identifier-shaped per lexical.md:13 and needs no amendment there",
    ).toBe(false);
  });
});

// ===========================================================================
// (B) §Reproduction (a) — the inline rows draw the new row; the DECLARATION
// controls are unmoved. Rows b4/b5 place the harness against live emitters, so
// no cell in this file can be a harness that has stopped reaching the parser.
// RED at HEAD: b1, b2, b3. GREEN now and after: b4, b5.
// ===========================================================================

describe("bug 0160 (B) — the inline rename is refused; the declaration spelling keeps its two rows", () => {
  it("RED B1: G1, G2 and G4 each draw the new row, once per renamed entry, in source order", () => {
    expectGroup(
      inlineRows(),
      "B1 — grammar.md:109 makes the inline field the object-schema `Field` form and admits the " +
        "rename on it; schemas.md:23 fixes the rename's position between the identifier and the " +
        "type. No inline position parses that form, so under §Fix (a) route 2 the spelling is " +
        "REFUSED rather than parsed: G1's two renamed entries draw two lines and G4's one draws " +
        "one",
    );
  });

  it("CONTROL B2: G3 and G5 — `checkObjectSchema` is not touched, so both declaration rows stand", () => {
    expectGroup(
      declRows(),
      "B2 — §Fix (c)'s third option leaves `theta/parse/wire-name-collision` and " +
        "`theta/parse/redundant-wire-name` DECLARATION-ONLY (code-registry-parse.md:90, :91). A " +
        "red here means the route reached into src/parser/schema-declarations.ts, which it does " +
        "not do, and would put the two rows' `<schema>` placeholder back in play",
    );
  });
});

// ===========================================================================
// (C) §Reproduction (b) — every `Type` position. type-system.md:15 runs one
// type grammar in every annotation position, so a fix at the shared walk
// answers alike everywhere and a fix at one call site cannot. A fix measured at
// the annotation root alone could not tell those apart, which is why the claim
// is a whole-map equality over 22 cells.
// RED at HEAD: all of C1, C2, C3.
// ===========================================================================

describe("bug 0160 (C) — the refusal holds at all eleven `Type` positions, `.thetalib` and `params:` included", () => {
  it("RED C1: the eleven positions, both fixtures, whole ordered lists", () => {
    expectGroup(
      positionRows(),
      "C1 — the ten token-joining positions hand the walk the raw key `aas\"w\"` and `params:` " +
        "hands it `a as \"w\"`; the settled predicate matches both and renders `a` from both, so " +
        "every cell reads alike. A cell that answers differently at `params:` alone is the " +
        "position-dependent failure mode a `parseObject` field-loop route would have had",
    );
  });

  it("RED C2: the same positions at CODE level, and the theta stops registering", () => {
    // The registry-independent half of C1: this reds on the MISSING REFUSAL
    // alone, so the parse-gate half of the fix has its own witness while the
    // registry half is outstanding.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const c of positionRows()) {
      const key = `${c.cell} :: ${c.src}`;
      actual[key] = codes(c.src, c.path);
      expected[key] = codesOf(c.expected);
    }
    expect(
      actual,
      "C2 — the emitted code at every position is the new row's and nothing else: the rename is " +
        "refused by the predicate inside the `inlineObjectFieldKeys` loop " +
        "(src/parser/type-grammar.ts:718) behind the two inherited gates (:999), not by a " +
        "residue sink",
    ).toEqual(expected);

    for (const [label, src, path] of positionSources(REN2)) {
      expect(
        registersCleanly(parseDoc(src, path)),
        `C2 — an error-severity diagnostic is what takes the source out of GOV-15's ` +
          `loads-cleanly set (source-language-stability.md:7) and is what withholds the ` +
          `artefacts group (D) measures. Position: ${label}; source=${JSON.stringify(src)}`,
      ).toBe(false);
    }
    expect(POSITION_LABELS.length, "C2 — eleven positions, none dropped").toBe(11);
  });

  it("RED C3: the `params:` frontmatter gate — the refused rename mints no lowered schema", () => {
    // The `params:` position's consequence is not only a diagnostic: a refused
    // `params:` type withholds the whole frontmatter, so
    // `frontmatter.params.loweredSchema` — the bytes
    // `production-theta-producer.ts` hands the binder as `paramsSchema` — is
    // never minted. The two neighbour rows already behave exactly this way,
    // which cell C4 measures at HEAD as the control.
    const refused = parseDoc(paramsSrc(`  p: '${REN1}'`), "bug0160.theta");
    expect(
      refused.frontmatter,
      "C3 — a `params:` field carrying an inline rename must not yield a frontmatter at all, so " +
        "no lowered schema keyed on `a as \"w\"` reaches the binder envelope",
    ).toBeNull();
  });

  it("CONTROL C4: the same gate under the two neighbour rows, and open for a clean type", () => {
    const dup = parseDoc(paramsSrc(`  p: '{a as "w": integer, a as "w": string}'`), "bug0160.theta");
    expect(
      dup.frontmatter,
      "C4 — bug 0159's row already closes the gate for the identical-rename spelling; this is " +
        "the shape cell C3 asserts for the non-repeating one",
    ).toBeNull();
    const quoted = parseDoc(paramsSrc(`  p: '{"a": string}'`), "bug0160.theta");
    expect(quoted.frontmatter, "C4 — and bug 0176's row closes it for a quoted key").toBeNull();
    const clean = parseDoc(paramsSrc("  p: '{a: integer}'"), "bug0160.theta");
    expect(
      clean.frontmatter,
      "C4 — while a clean inline type still registers, so C3's red cannot be a broken harness",
    ).not.toBeNull();
  });
});

// ===========================================================================
// (D) §Reproduction (c) L1–L6 — the DIRECT lowerer bytes, UNCHANGED. This is
// the control that proves §Fix (b) was honoured: the route adds a refusal and
// edits no lowerer, so bug 0035's and bug 0039's freezes stay intact and these
// fragments are byte-identical before and after. Group (C) is the other half of
// the same statement: after the fix these bytes are reachable only by a DIRECT
// call, never through a load.
// GREEN now and after.
// ===========================================================================

/** L1 — the two-field rename fixture's own fragment, keyed on the pre-colon text. */
const L1_FRAGMENT = {
  type: "object",
  properties: { 'a as "w"': { type: "integer" }, 'b as "w"': { type: "string" } },
  required: ['a as "w"', 'b as "w"'],
  additionalProperties: false,
} as const;

/** The `$defs` name every hoisting position mints for it (schema-subset.md:73). */
const L1_SLUG = "__inline_2b94136edf91cb61";

describe("bug 0160 (D) — the lowered keys the refusal prevents, by direct call, byte-frozen", () => {
  it("CONTROL D1: L1, L4, L5, L6 at the annotation root", () => {
    const actual: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    const cells: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      [REN2, L1_FRAGMENT],
      // L4 — the redundant-rename spelling: one key, `a as "a"`.
      [
        '{a as "a": integer}',
        {
          type: "object",
          properties: { 'a as "a"': { type: "integer" } },
          required: ['a as "a"'],
          additionalProperties: false,
        },
      ],
      // L5 — schemas.md:23's own PascalCase example. schemas.md:39 calls the
      // rename the ONLY mechanism for such a property name; inline it mints
      // `first_name as "FirstName"` instead, which is the harm the refusal
      // removes by telling the author to declare the schema.
      [
        '{first_name as "FirstName": string}',
        {
          type: "object",
          properties: { 'first_name as "FirstName"': { type: "string" } },
          required: ['first_name as "FirstName"'],
          additionalProperties: false,
        },
      ],
      // L6 — the well-formed rename neither assigned diagnostic touches, and
      // equally malformed on the wire: the harm sits outside both rows' input
      // sets, which is why the refusal is keyed on the rename SPELLING.
      [
        '{a as "w": integer, b as "x": string}',
        {
          type: "object",
          properties: { 'a as "w"': { type: "integer" }, 'b as "x"': { type: "string" } },
          required: ['a as "w"', 'b as "x"'],
          additionalProperties: false,
        },
      ],
      // The token-joined spelling the ten non-`params:` positions actually hand
      // the lowerer: the same defect one character-class to the side, and the
      // reason the rendered subject cannot be the raw key.
      [
        '{aas"w":integer,bas"w":string}',
        {
          type: "object",
          properties: { 'aas"w"': { type: "integer" }, 'bas"w"': { type: "string" } },
          required: ['aas"w"', 'bas"w"'],
          additionalProperties: false,
        },
      ],
    ];
    for (const [type, fragment] of cells) {
      actual[type] = lowerQueryResponseSchema(type, [], []);
      expected[type] = fragment;
    }
    expect(
      actual,
      "D1 — every key contains a `\"` character and every non-joined one a space; " +
        "lexical.md:13 admits neither, so no theta expression can read these properties and no " +
        "author wrote these names. §Fix (b) leaves them exactly here and makes them unreachable " +
        "through a load instead",
    ).toEqual(expected);
  });

  it("CONTROL D2: L2 and L3 — the `$defs` hoists, one content-addressed name", () => {
    expect(
      Object.fromEntries(
        buildBodyTypeSchemas([{ name: "S", fields: [{ name: "p", typeSource: REN2 }] }], []).entries(),
      ),
      "D2 — L2: the body-type map hoists L1's fragment under its canonical slug " +
        "(schema-subset.md:73)",
    ).toEqual({
      S: {
        type: "object",
        properties: { p: { $ref: `#/$defs/${L1_SLUG}` } },
        required: ["p"],
        additionalProperties: false,
        $defs: { [L1_SLUG]: L1_FRAGMENT },
      },
    });

    const defs: Record<string, Record<string, unknown>> = {};
    const unresolved: string[] = [];
    const ctx: LowerCtx = { bodyTypeMap: new Map(), defs, unresolved };
    expect(
      lowerParamsFieldType(REN2, ctx),
      "D2 — L3: the `params:` field lowers to a `$ref` at the same name",
    ).toEqual({ $ref: `#/$defs/${L1_SLUG}` });
    expect(defs, "D2 — and registers L1's fragment bytes verbatim").toEqual({
      [L1_SLUG]: L1_FRAGMENT,
    });
    expect(unresolved, "D2 — a rename resolves no named type").toEqual([]);
  });

  it("CONTROL D3: the respond tool advertises those keys verbatim", () => {
    expect(
      respondToolWireSchema(L1_FRAGMENT as unknown as LoweredSchema),
      "D3 — an object root is returned verbatim (src/runtime/respond-tool-wire.ts:92), so the " +
        "keys the model is shown are the source text; the refusal is what keeps this document " +
        "from ever being built through a load",
    ).toEqual(L1_FRAGMENT);
  });

  it("CONTROL D4: S14's post-type spelling still lowers its permissive property", () => {
    expect(
      lowerQueryResponseSchema('{a: integer as "w"}', [], []),
      "D4 — the lowerers do not know the post-type spelling either: `integer as \"w\"` is handed " +
        "on as a type source and lowers to `{}`. 0160 §Non-goals leaves that spelling unclaimed " +
        "and this route leaves `parseObject`'s post-type `as` skip untouched",
    ).toEqual({
      type: "object",
      properties: { a: {} },
      required: ["a"],
      additionalProperties: false,
    });
  });
});

// ===========================================================================
// (E) §Reproduction (d) D1–D10, RE-MEASURED at HEAD after bug 0159's 0.93.0
// landing. The identical-rename duplicate D1–D4/D6 and the nested route D7–D9
// are already CLOSED there (0160's own coordination note records it), so this
// group is a control group in both directions: the repeating-key precedence
// must keep them exactly here, and the two real AJV compiles must stay
// reachable only by direct construction. No `catch` is added at any AJV seam
// (0160 §Non-goals).
// GREEN now and after.
// ===========================================================================

describe("bug 0160 (E) — the duplicate family bug 0159 closed, and the AJV outcomes it made unreachable", () => {
  it("CONTROL E1: D1 and D5 — a repeating rename key keeps bug 0159's row alone, at all eleven positions", () => {
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    // The subject is the RAW key. Since bug 0228's fix every position's brace
    // group is a raw slice of the author's own source bytes, so `a as "w"` is
    // now the rendering at EVERY position, `params:` included — no more
    // position-dependent spelling for this cell to hold side by side.
    for (const [label, src, path] of positionSources('{a as "w": integer, a as "w": string}')) {
      const key = `e1 ${label} :: ${src}`;
      actual[key] = lines(src, path);
      expected[key] = renderAll([DUP('a as "w"')]);
    }
    expect(
      actual,
      "E1 — the settled precedence is that a repeating key is bug 0159's subject ALONE and draws " +
        "nothing from the new row; a red here means the new row was inserted before the " +
        "repeating branch instead of inside the non-repeating one",
    ).toEqual(expected);
    expect(
      lines(annotSrc("{a: integer, a: string}")),
      "E1 — D5, the plain-name control that bug 0052 closed in 0.84.0",
    ).toEqual(renderAll([DUP("a")]));
  });

  it("CONTROL E2: D7 and D10 — the enclosing body's own repeat is compared", () => {
    // Re-derived against this fix, not copied from 0159's D7 pin: `p`'s value is
    // still `{a as "w": integer}`, still successfully pushed to the ENCLOSING
    // node's `fieldTypes` before the break (`carriesUnclosedInterior` only
    // latches `namesStopped`, which gates future `fieldNames` pushes, not the
    // `fieldTypes` recursion `walkType` performs). That nested object is walked
    // exactly as cell g19 walks one two levels deep, so its own raw-key loop
    // draws this row for `a` beside the enclosing `q` repeat 0159's own raw-key
    // loop draws independently of the field loop's success. Two different keys
    // at two different nesting depths, drawn by two different rules' raw-key
    // loops, in the walk's own source-then-descend order.
    expect(
      lines(annotSrc('{p: {a as "w": integer}, q: integer, q: string}')),
      "E2 — D7 closed in 0.93.0 for the ENCLOSING repeat; this fix additionally draws its own " +
        "row for `p`'s nested rename, because the key list is derived from `interiorSource` " +
        "rather than from the field loop's output, at every nesting depth the walk descends",
    ).toEqual(renderAll([DUP("q"), REN("a")]));
    expect(
      lines(annotSrc("{p: {a: integer}, q: integer, q: string}")),
      "E2 — D10, its plain-name control",
    ).toEqual(renderAll([DUP("q")]));
  });

  it("CONTROL E3: D2, D3, D8 and the two real `AjvSchemaValidator.compile` throws", () => {
    // Reached by DIRECT construction only: both source spellings are refused at
    // load today, so the roots below are the prevented artefacts, pinned so a
    // future route that re-admitted either input would red here rather than
    // silently re-open the throw class.
    const d2 = lowerQueryResponseSchema('{a as "w": integer, a as "w": string}', [], []);
    expect(
      d2,
      "E3 — D2: `properties[…]` overwrites last-wins while `required.push` appends, so one key " +
        "twice mints a two-item `required`",
    ).toEqual({
      type: "object",
      properties: { 'a as "w"': { type: "string" } },
      required: ['a as "w"', 'a as "w"'],
      additionalProperties: false,
    });
    expect(
      respondToolWireSchema(d2 as unknown as LoweredSchema),
      "E3 — D3: byte-identical through the respond-tool wire",
    ).toEqual(d2);

    const first = ajv();
    expect(
      () => first.validator.compile(d2 as unknown as LoweredSchema),
      "E3 — D4: AJV's meta-schema is applied to the ROOT document " +
        "(src/seams/schema-validator.ts:441), which constrains `required` to unique items",
    ).toThrow("schema is invalid: data/required must NOT have duplicate items (items ## 1 and 0 are identical)");

    const d8 = lowerQueryResponseSchema('{p: {a as "w": integer}, q: integer, q: string}', [], []);
    expect(
      d8,
      "E3 — D8: the second route to the same class, through the enclosing body's own repeat",
    ).toEqual({
      type: "object",
      properties: {
        p: { $ref: "#/$defs/__inline_de5b12721bc77264" },
        q: { type: "string" },
      },
      required: ["p", "q", "q"],
      additionalProperties: false,
      $defs: {
        __inline_de5b12721bc77264: {
          type: "object",
          properties: { 'a as "w"': { type: "integer" } },
          required: ['a as "w"'],
          additionalProperties: false,
        },
      },
    });
    const second = ajv();
    expect(
      () => second.validator.compile(d8 as unknown as LoweredSchema),
      "E3 — D9: the same refusal one index along",
    ).toThrow("schema is invalid: data/required must NOT have duplicate items (items ## 2 and 1 are identical)");
    expect(
      [...first.emitted, ...second.emitted].map((d) => d.code),
      "E3 — the seam throws rather than emitting; no diagnostic is minted on either compile",
    ).toEqual([]);
  });

  it("CONTROL E4: D6 — the hoisted duplicate inside a `$defs` member still compiles", () => {
    // The asymmetry between a duplicate `required` at the ROOT and one inside a
    // `$defs` member is a property of the validator seam (AJV applies the
    // meta-schema to the root document only). 0160 §Non-goals leaves it there;
    // refusing the input removes the outcome without touching the seam.
    const hoisted = {
      type: "object",
      properties: { p: { $ref: `#/$defs/${L1_SLUG}` } },
      required: ["p"],
      additionalProperties: false,
      $defs: {
        [L1_SLUG]: {
          type: "object",
          properties: { 'a as "w"': { type: "string" } },
          required: ['a as "w"', 'a as "w"'],
          additionalProperties: false,
        },
      },
    };
    const { validator, emitted } = ajv();
    const compiled = validator.compile(hoisted as unknown as LoweredSchema);
    expect(
      emitted.map((d) => d.code),
      "E4 — no diagnostic and no throw: the meta-schema never reaches the `$defs` member",
    ).toEqual([]);
    expect(
      compiled.validate({ p: { 'a as "w"': "s" } }).ok,
      "E4 — and it enforces a property name no theta expression can address",
    ).toBe(true);
  });
});

// ===========================================================================
// (F) §Reproduction (e) S1–S13 and §Reproduction (f) S14, re-measured at HEAD,
// each with its control, plus the suppression family's (former) CAUSE. Bug
// 0231 (route 1) DOES close this family at the field-loop site: a malformed
// entry accounts for itself and for nothing else
// (code-registry-parse.md:101's count-consequence sentence), so a field
// written BEHIND a rename now reaches `fieldTypes` and draws its own
// control's row alongside the rename refusal, in that order — the rename
// refusal is a raw-key-loop emission and the raw-key loop always runs before
// the `fieldTypes` recursion. Those rows therefore assert the new line AND
// the control's own line, which is the honest post-0231 statement.
// RED at HEAD: f1, f3, f5, f7, f9, f11, f12, f13, f16.
// GREEN now and after: f2, f4, f6, f8, f10, f14, f15, f17.
// ===========================================================================

describe("bug 0160 (F) — the suppression family gains the refusal, and (since bug 0231) the field it used to silence", () => {
  it("RED F1: S1–S13 with their controls, and S14 as the over-reach tripwire", () => {
    expectGroup(
      suppressionRows(),
      "F1 — a red on an f-row missing the rename line means the refusal did not fire; a red on " +
        "an f-row missing its control's OWN line means bug 0231's field-loop resynchronisation " +
        "regressed — a malformed entry must account for itself and for nothing else " +
        "(code-registry-parse.md:101), so the field behind it draws its own verdict exactly as " +
        "its single-field control does",
    );
  });

  it("CONTROL F2: S14 does not move at any position, and never draws the new row", () => {
    // The post-type spelling reaches `parseObject`'s own `as` skip and is
    // refused one layer up as a non-type-expression at ten of the eleven
    // positions. Its raw key is the bare identifier `a`, so the predicate
    // cannot match it — the tripwire is that the new row appears NOWHERE here.
    const actual: Record<string, string[]> = {};
    for (const [label, src, path] of positionSources('{a: integer as "w"}')) {
      actual[label] = codes(src, path);
    }
    expect(
      Object.entries(actual)
        .filter(([, list]) => list.includes(RENAMED_INLINE))
        .map(([label]) => label),
      "F2 — no position may draw the new row for the post-type spelling: it is not a form " +
        "grammar.md:101 or schemas.md:23 defines, 0160 §Non-goals claims no diagnostic for it, " +
        "and its raw key is `a`",
    ).toEqual([]);
    expect(
      actual,
      "F2 — and the codes it DOES draw are unchanged by this route; `invoke<T>` alone is silent",
    ).toEqual({
      "@<T> annotation root": [QUERY_ANNOT_NOT_EXPR],
      "let annotation": ["theta/parse/annotation-type-not-expression"],
      "schema body field": ["theta/parse/schema-type-not-expression"],
      "fn parameter": ["theta/parse/annotation-type-not-expression"],
      "fn return": ["theta/parse/annotation-type-not-expression"],
      "alias RHS": ["theta/parse/schema-type-not-expression"],
      "params: field": ["theta/load/params-type-not-expression"],
      "invoke<T>": [],
      "union arm": [QUERY_ANNOT_NOT_EXPR],
      "nested one level": [QUERY_ANNOT_NOT_EXPR],
      ".thetalib schema field": ["theta/parse/schema-type-not-expression"],
    });
  });

  it("CONTROL F3: the field-head resynchronisation (bug 0231) reaches `void` at the quoted-key head and at `params:` alike", () => {
    // Two measurements, both independent of this row's own subject. (i) The
    // quoted-key spelling carries no `as` at all — no rename anywhere in the
    // source — and now names the `void` behind it too, so bug 0231's fix is
    // at the field loop itself (src/parser/type-grammar.ts's `parseObject`),
    // not at any rename-specific site. (ii) At `params:` the raw text keeps
    // its spaces, so the token-join capture was never the cause either — the
    // `void` is named there on the same footing as its control.
    expect(
      lines(body(`schema S { p: {"a": string, b: void} }`)),
      "F3(i) — the quoted-key head accounts for itself (`quoted-inline-field-name`) and no " +
        "longer withholds its sibling's verdict: `void` behind it now draws its own row too",
    ).toEqual(renderAll([QUOTED('"a"'), VOIDEXP()]));
    expect(
      lines(paramsSrc(`  p: '{a as "w": integer, b: void}'`)).filter((l) =>
        l.includes(VOID_NON_RETURN),
      ),
      "F3(ii) — and at `params:`, where the raw spelling `a as \"w\"` survives intact, the " +
        "`void` behind the rename is named exactly as its control names it",
    ).toEqual(renderAll([VOIDEXP()]));
    expect(
      lines(paramsSrc("  p: '{a: integer, b: void}'")),
      "F3(ii) — with the control at the same position, unmoved",
    ).toEqual(renderAll([VOIDEXP()]));
  });
});

// ===========================================================================
// (G) BOUNDARIES, EACH MEASURED AT HEAD BEFORE IT WAS WRITTEN DOWN. The
// precedence (repeating key → bug 0159's row alone; quote-first key → bug
// 0176's row alone; only then this row) and the two inherited gates are the
// whole of this group's subject.
// RED at HEAD (bug 0160's own baseline): g6, g7, g8, g10, g11, g12, g13, g14,
// g16, g17, g18, g19, g22.
// GREEN then (this row's own subject silent) and STILL SILENT ON THIS ROW
// after bug 0228: g2, g3, g5, g9. g4 (a rename inside a generic argument) was
// silent through bug 0228 too, but bug 0233 closes that class — the
// generic-argument gate this row shared with bugs 0052 and 0176 is gone, so
// g4 now names this row, RE-PINNED with 0233 as its authority. g20/g21 (an
// escaped quote in the wire
// name) were silent through bug 0228 too, but bug 0229 closes that class: the
// colon scan and this row's predicate both now admit the escape, so g20/g21
// draw the row and move OUT of this silent set into the ones that name it.
// g1, g15 and g23 are also silent on THIS row throughout, but since bug
// 0228's fix each now draws `theta/parse/inline-field-name-not-identifier`
// instead of nothing at all (§Fix (b)'s newly-refused set), so they carry a
// non-empty expectation too. Since bug 0231's fix g18 draws a SECOND line:
// the outer object's two malformed-bodied fields (`p` and `q`) were both
// unreached by `parseObject`'s old outright break, and route 1's
// resynchronisation reaches both, so the walk descends into both nested
// interiors and each names its own rename.
// ===========================================================================

describe("bug 0160 (G) — quote style, precedence, the two gates, and the neighbours' subjects", () => {
  it("RED G1: every boundary cell, whole ordered lists", () => {
    expectGroup(
      boundaryRows(),
      "G1 — a red on g1/g15 means the predicate is looser than the settled one (a key that is " +
        "merely non-identifier, or an `as` with no wire name, is not a rename); a red on g2/g3 " +
        "means the precedence order is wrong; a red on g4/g5 means a gate was dropped; a red on " +
        "g9 means bug 0154's identifier pass was disturbed",
    );
  });

  it("CONTROL G2: `{Ys as \"w\": string}` draws no `binding-case-mismatch`, and why", () => {
    // Bug 0154 §Fix Residual 1, measured not inferred: 0154's pass reads
    // `TypeNode.fieldNames`, and `parseObject`'s field loop breaks at the
    // rename BEFORE pushing the name, so `Ys` never enters that list. This
    // route does not repair that — it refuses the input instead — so the
    // absence is pinned with its cause rather than left as an omission.
    expect(
      codes(annotSrc('{Ys as "w": string}')).filter((c) => c === BINDING_CASE),
      "G2 — 0160 §Non-goals: a fix here must NOT emit `theta/parse/binding-case-mismatch` at " +
        "this position. Row w2 of bug 0154 stays open on its own terms",
    ).toEqual([]);
    expect(
      codes(annotSrc("{Ys: string}")),
      "G2 — while the plain ill-cased spelling still draws it, so the absence above is a " +
        "property of the rename spelling and not of a broken pass",
    ).toEqual([BINDING_CASE]);
  });

  it("CONTROL G3: the generic-argument's lowering and the unclosed-interior gate keep their bytes", () => {
    expect(
      lowerQueryResponseSchema('array<{a as "w": string}>', [], []),
      "G3 — the lowering never divides a generic argument's interior into fields, which is the " +
        "ground g4's new refusal stands on (bug 0233): the WIRE consequence of the rename is " +
        "unmoved, only whether the source is judged",
    ).toEqual({ type: "array", items: {} });
    expect(
      lowerQueryResponseSchema('{a as "w": string', [], []),
      "G3 — an interior that never closes spells no `ObjectType` (grammar.md:101 requires the " +
        "closing brace) and mints no property at all",
    ).toEqual({});
    expect(
      lowerQueryResponseSchema('{a"b": string}', [], []),
      "G3 — and g1's non-rename non-identifier key still mints its own malformed property: that " +
        "class is not claimed here",
    ).toEqual({
      type: "object",
      properties: { 'a"b"': { type: "string" } },
      required: ['a"b"'],
      additionalProperties: false,
    });
  });

  it("CONTROL G4: the escaped-quote spelling now lowers its field; the double-rename spelling is unaffected", () => {
    // Bug 0229 closes the escaped-quote half of this cell: `topLevelColon`
    // now shares `splitTopLevelSegments`' backslash arm, so `a as "w\"x"` is a
    // colon-bearing entry and `INLINE_FIELD_RENAME`'s widened wire-name
    // alternatives judge it. g23's double-rename spelling is a different
    // class — it DOES spell a key today, at HEAD and after — and stays exactly
    // as it was.
    expect(
      lowerQueryResponseSchema('{a as "w\\"x": integer}', [], []),
      "G4 — the escape-aware colon scan yields the colon the author wrote, so the raw key " +
        '`a as "w\\"x"` is minted as the sole property, required by default — the field is no ' +
        "longer dropped",
    ).toEqual({
      type: "object",
      properties: { 'a as "w\\"x"': { type: "integer" } },
      required: ['a as "w\\"x"'],
      additionalProperties: false,
    });

    const defs: Record<string, Record<string, unknown>> = {};
    const unresolved: string[] = [];
    const ctx: LowerCtx = { bodyTypeMap: new Map(), defs, unresolved };
    expect(
      lowerParamsFieldType('{a as "w\\"x": integer}', ctx),
      "G4 — and at `params:`, where the raw spelling survives intact, the entry now hoists a " +
        "`$defs` member instead of collapsing to the permissive `{}`",
    ).toEqual({ $ref: "#/$defs/__inline_68a87e995fbc02c1" });
    expect(defs, "G4 — carrying the hoisted member's own bytes").toEqual({
      __inline_68a87e995fbc02c1: {
        type: "object",
        properties: { 'a as "w\\"x"': { type: "integer" } },
        required: ['a as "w\\"x"'],
        additionalProperties: false,
      },
    });
    expect(unresolved, "G4 — a rename resolves no named type").toEqual([]);

    expect(
      lowerQueryResponseSchema('{a as "w" as "x": integer}', [], []),
      "G4 — UNAFFECTED by this route: the double-rename spelling DOES spell a key, and the key " +
        "is the whole raw text — the under-refusal cell g23 records is a property name no author " +
        "wrote, left reachable because the predicate admits no trailing text behind the wire-name " +
        "literal",
    ).toEqual({
      type: "object",
      properties: { 'a as "w" as "x"': { type: "integer" } },
      required: ['a as "w" as "x"'],
      additionalProperties: false,
    });
  });
});

// ===========================================================================
// (H) THE INVENTORY ITSELF — anti-vacuity, and the registry-independent
// restatement of every cell.
// ===========================================================================

describe("bug 0160 (H) — the inventory is counted, and every cell is also asserted without the registry", () => {
  it("CONTROL H1: 67 diagnostic-list cells, 49 of them naming the new row", () => {
    const cells = allCells();
    expect(
      cells.length,
      "H1 — the declared inventory size. A cell deleted or a group silently dropped moves this " +
        "count, so the file cannot shrink unnoticed",
    ).toBe(TOTAL_LIST_CELLS);
    const withNewRow = cells.filter((c) => c.expected.some((e) => e.code === RENAMED_INLINE));
    expect(
      withNewRow.length,
      "H1 — the declared count of cells carrying a NON-EMPTY expectation that names " +
        `${RENAMED_INLINE}. A cell weakened to \`[]\` to make the file green would move this ` +
        "count, which is what makes the red set above non-vacuous",
    ).toBe(NEW_ROW_LIST_CELLS);
    // Since bug 0228's fix g1, g15 and g23 are no longer silent-by-design
    // overall: each now names `theta/parse/inline-field-name-not-identifier`
    // (this file's own row still declines each of them, on its own subject
    // — no repeat, no quote-led, no rename — which is why they moved OUT of
    // this list rather than out of the boundary group). Bug 0229 closes g20/g21
    // the other direction: both now name this row, so the empty-expectation
    // list loses them and shrinks to the two gates this row itself withholds
    // on.
    expect(
      cells.filter((c) => c.expected.length === 0).map((c) => c.cell),
      "H1 — and the empty-expectation cell is exactly the one silent-by-design gate row that " +
        "survives bug 0233: g4 moved out of this list when the generic-argument gate went, " +
        "leaving g5's unclosed-interior gate alone",
    ).toEqual(["g5"]);
    expect(
      new Set(cells.map((c) => `${c.cell} :: ${c.src}`)).size,
      "H1 — every cell key is distinct, so no whole-map equality silently drops a row",
    ).toBe(cells.length);
  });

  it("RED H2: the whole inventory at CODE level — the silence signature, with no registry dependency", () => {
    // The registry-independent restatement of groups (B), (C), (F) and (G). At
    // HEAD every red here is a MISSING code where a refusal is owed, which is
    // the silence-instead-of-refusal signature 0160 measures; it cannot be a
    // message-wording or missing-row failure, because no registry template is
    // consulted.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const c of allCells()) {
      const key = `${c.cell} :: ${c.src}`;
      actual[key] = codes(c.src, c.path);
      expected[key] = codesOf(c.expected);
    }
    expect(
      actual,
      "H2 — the whole inventory's ordered CODE lists. This is the cell to read first on a red: " +
        "a missing `" +
        RENAMED_INLINE +
        "` entry is the defect; an extra or reordered entry is an over-reach or a precedence " +
        "error",
    ).toEqual(expected);
  });
});
