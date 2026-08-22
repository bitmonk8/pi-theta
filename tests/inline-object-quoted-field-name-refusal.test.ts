import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { buildBodyTypeSchemas } from "../src/parser/body-type-lowering";
import { lowerParamsFieldType, type LowerCtx } from "../src/parser/params";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { buildTypedQueryValidation } from "../src/runtime/typed-query-validation";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0176 — the inline field-name slot admits a QUOTED key. `{"a": string}`
// loads with zero diagnostics at all eleven `Type` positions and lowers a JSON
// Schema property whose name is the three characters `"a"`, quote characters
// included, under `required: ["\"a\""]` and `additionalProperties: false` — a
// name docs/spec_topics/lexical.md:13's identifier production cannot spell and
// docs/spec_topics/schemas.md:39 reserves to the `as "WireName"` clause. A real
// `AjvSchemaValidator` compiles that fragment and enforces it, so a payload
// naming the field the author wrote is rejected twice over and the typed query
// spends its whole repair budget before returning
// `Err(ValidationError { cause: "schema_validation" })`, while a payload copying
// the schema's own escaped key binds a value whose only property no theta
// expression can read
// (docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md).
// This file is that report's witness.
//
// THE ADJUDICATION THIS FILE ENCODES (0176 §Fix route **A**, as settled):
//   - A1 detection site (ii) — `inlineObjectFieldKeys`
//     (src/parser/type-grammar.ts:656), scanned in `walkType`'s object-arm
//     raw-key loop behind the one gate that loop reads, `node.closingBraceSpelled`
//     (bug 0233 dropped the loop's other, narrower `!insideGenericArgument` half,
//     so this row now answers alike at every depth beneath a generic argument).
//     `TypeParser.parseObject`'s tolerant `else` branch is not touched, which is
//     why 0045's `{ a }` and `{ a: }` stay exactly as measured (group (H)).
//   - A3 emission set, the NARROW answer — a key whose FIRST character is `"` or
//     `'` is refused. 0160's `a as "w"` (raw key `a as "w"` / `aas"w"`) is
//     therefore NOT this row's subject and draws nothing from it (group (H)
//     row h5), leaving grammar.md's inline `Field` form free for
//     docs/bugs/0160-inline-object-wire-name-rename-unparsed.md to answer on
//     its own row (`theta/parse/renamed-inline-field-name`, landed X.Y.Z) —
//     h5's cell is re-pinned to that row rather than to `[]`.
//   - PRECEDENCE — a key that REPEATS within one interior keeps
//     `theta/parse/duplicate-inline-field-name` alone and draws nothing from the
//     new row (group (G) rows c1–c4); a non-repeating quoted key draws the new
//     row. Emission order is source order, interleaved with the duplicate lines,
//     a body's own before those of bodies nested in its field types.
//   - The new registry row is `theta/parse/quoted-inline-field-name`, E, parse,
//     whose *Message* is
//     `quoted field name '<field>' within one inline object type; field names are identifiers`,
//     with `<field>` rendering the raw key verbatim after `trim()` by a SECOND
//     row-scoped carve-out beside the duplicate row's
//     (docs/spec_topics/diagnostics/placeholder-rendering-b.md:10).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:101 — `ObjectType ::= "{" Field ("," Field)*
//     ","? "}"`, "inline anonymous object type; `Field` per Schema
//     Declarations", and :109's prose repeat: an `ObjectType`'s fields reuse the
//     same `Field` form as an object-schema body.
//   - docs/spec_topics/schemas.md:17 — "Field names are identifiers"; :23 — the
//     `as "WireName"` clause sits AFTER the field identifier; :39 — that clause
//     "is the only mechanism for expressing schemas whose property names are not
//     theta-identifier-compatible".
//   - docs/spec_topics/lexical.md:13 — an identifier is `[A-Za-z_][A-Za-z0-9_]*`,
//     which admits no quote character. This is why the minted key of group (C)
//     is unreachable from theta and why group (A)'s refusal is owed.
//   - docs/spec_topics/type-system.md:15 — one type grammar in every annotation
//     position, which is why the eleven cells of group (A)'s table must answer
//     alike.
//   - DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md:72) — the
//     registry is closed: the new row lands in the same commit as the code.
//     Cell A0 is that obligation made falsifiable.
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74) — the
//     *Message* column is normative and tests MUST source it from the registry.
//     Every expected string here is read out of
//     docs/spec_topics/diagnostics/code-registry-parse.md through
//     `registryMessage`; no message prose is copied.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:91 — the
//     `theta/parse/empty-schema-body` row the DECLARATION spelling keeps
//     (group (B)); :92 — the `theta/parse/duplicate-inline-field-name` row whose
//     emission set this fix does not widen (group (G)).
//   - docs/spec_topics/governance/source-language-stability.md:9 — the
//     loads-cleanly predicate (no `E`-severity diagnostic), the observable
//     groups (A) and (F) read; :25 — the diagnostic-registry carve-out, the
//     addition arm, which dispositions every newly-refused spelling enumerated
//     in group (F).
//
// TIER: unit, offline, deterministic, provider-free — the tier the repository
// puts this kind of claim in, and the tier above it is insufficient for nothing
// here. Every claim settles inside one `parseThetaDocument` call over a string
// (`parseDoc`, tests/helpers/e2e-s1.ts:39, the shipped load path wrapped in the
// standard inert `parseDeps` double), one direct lowerer call
// (`lowerQueryResponseSchema` src/runtime/query-schema-lowering.ts:153,
// `buildBodyTypeSchemas` src/parser/body-type-lowering.ts:428,
// `lowerParamsFieldType` src/parser/params.ts), one real
// `AjvSchemaValidator.compile` (src/seams/schema-validator.ts:390, `#build` at
// :441) or one real `buildTypedQueryValidation`
// (src/runtime/typed-query-validation.ts:168) drive over a SCRIPTED follow-up.
// An integration tier would add a session round-trip and could assert none of
// these more sharply; a live tier would make the group (E) assertion stochastic
// on top with no new reach, because the whole repair loop
// (`runRespondRepairLoop`, src/runtime/query-respond-repair.ts:201, terminal
// `terminalValidationError` at :282) is reachable in-process with no provider.
//
// WHAT IS RED HERE (derived before it was measured): cell A0 (the registry row
// does not exist yet), cells A1 and A2 (the eleven positions report `[]` where
// the refusal is owed), group (F) (all seven quote-style rows report `[]`) and
// cell G2 (`{"a": string, 'a': integer}` reports `[]` where two distinct
// non-repeating quoted keys are owed). Groups (B), (C), (D), (E), (H) and cell
// G1 are CONTROLS: green now and green after. A red in (B) means the fix moved
// the declaration position (§Fix A5) that bug 0133 owns; a red in (C)/(D)/(E)
// means a lowerer or a runtime seam moved rather than the parse gate — those
// bytes are what the refusal PREVENTS, reached by direct call and frozen; a red
// in (G1) means the fix drew a second line on a repeated key against the settled
// precedence; a red in (H) means it reached into 0045's reserved shapes, 0052's
// generic-argument carve-out, or 0160's rename subject.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. The
// registry lookup asserts its row's presence and its placeholder before the
// template is used, so a missing or reworded row reds by naming the registry
// rather than by a silently-wrong expectation; every emission cell asserts its
// whole UNFILTERED ordered diagnostic list, so an absent emission can never read
// as a pass; cell A2 asserts the same eleven positions at CODE level with no
// registry dependency at all, so the missing refusal is witnessed even while the
// registry half of the fix is outstanding.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

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

/** The code route A adds (0176 §Fix A2, settled: a new row, E, parse). */
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
/** The code a REPEATED key keeps alone (code-registry-parse.md:92). */
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
/** The code the DECLARATION spelling keeps, unmoved (:91). */
const EMPTY_BODY = "theta/parse/empty-schema-body";

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
function line(severity: string, code: string, message: string): string {
  return `${severity} ${code}: ${message}`;
}

/**
 * The rendering for a quoted inline field-name KEY. The subject is the entry's
 * raw pre-colon text after `trim()`, rendered verbatim by the row-scoped
 * `<field>` carve-out this fix writes beside the duplicate row's
 * (placeholder-rendering-b.md:10); the row template's own single quotes delimit
 * it.
 */
function quotedLine(field: string): string {
  return line("error", QUOTED_INLINE, msg(QUOTED_INLINE, [["<field>", field]]));
}

/** The rendering a REPEATED inline field-name key keeps (code-registry-parse.md:92). */
function dupLine(field: string): string {
  return line("error", DUPLICATE_INLINE, msg(DUPLICATE_INLINE, [["<field>", field]]));
}

/** The rendering the DECLARATION spelling of a quoted field name keeps. */
function emptyBodyLine(schema: string): string {
  return line("error", EMPTY_BODY, msg(EMPTY_BODY, [["<X>", schema]]));
}

/** The code bug 0160 adds for an inline `as "WireName"` rename (X.Y.Z). */
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";

/**
 * The rendering for an inline wire-name rename (bug 0160). `<field>` renders
 * the pattern's own captured theta-side identifier rather than the raw key,
 * which is why this rendering is the same at every position regardless of
 * whether the position hands the rule the raw `a as "w"` or the token-joined
 * `aas"w"`.
 */
function renLine(field: string): string {
  return line("error", RENAMED_INLINE, msg(RENAMED_INLINE, [["<field>", field]]));
}

// ===========================================================================
// Fixtures. One builder per `Type` position of 0176 §Reproduction (a), in the
// vocabulary of the landed sibling locks
// (tests/inline-object-field-name-comparison-key.test.ts,
// tests/inline-object-duplicate-field-name.test.ts). Every body fixture ends
// `let a = 1` + `a` so the theta carries a tail expression, and every fixture
// carries `mode: prompt` so no `theta/load/missing-mode` noise is present.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by the tail. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/**
 * A `mode: prompt` theta whose `params:` block is `block`. The type is written
 * as a SINGLE-quoted YAML scalar throughout this file (0176 §Reproduction row
 * q7) so an interior double quote reaches the theta type grammar intact; the
 * unquoted flow-mapping spelling resolves one layer earlier as a frontmatter
 * subject (§Non-goals).
 */
function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — the position whose lowering IS the document root. */
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

// ===========================================================================
// Parse + assertion helpers. Loud on every unexpected disposition.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "bug0176.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

/** Every diagnostic CODE, in emission order — the registry-independent observable. */
function codes(src: string, path = "bug0176.theta"): string[] {
  return parseDoc(src, path).diagnostics.map((d) => d.code);
}

/**
 * The whole ordered diagnostic list of one source, asserted against `expected`.
 * A whole-list equality is what makes both directions reachable: an absent
 * emission and an extra one both red, and the multiplicity and precedence claims
 * of groups (A), (F) and (G) are only meaningful against a whole list.
 */
function expectList(src: string, expected: readonly string[], why: string): void {
  expect(lines(src), `${why}\nsource=${JSON.stringify(src)}`).toEqual([...expected]);
}

/**
 * GOV-15's loads-cleanly predicate (source-language-stability.md:9): a source
 * emitting no `E`-severity diagnostic. This is the observable that separates
 * "the author is told" from "the artefact is minted and handed on".
 */
function registersCleanly(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some((d) => d.severity === "error");
}

/** The eleven `Type` positions of 0176 §Reproduction (a), rows q1–q11. */
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

/** The whole ordered diagnostic list of one inline type at each of those eleven positions. */
function positions(type: string): Record<string, string[]> {
  return {
    "@<T> annotation root": lines(annotSrc(type)),
    "let annotation": lines(body(`let x: ${type} = 1`)),
    "schema body field": lines(body(`schema S { p: ${type} }`)),
    "fn parameter": lines(body(`fn f(p: ${type}) { 1 }`)),
    "fn return": lines(body(`fn f(): ${type} { 1 }`)),
    "alias RHS": lines(body(`schema S = ${type}`)),
    "params: field": lines(paramsSrc(`  p: '${type}'`)),
    "invoke<T>": lines(body(`let r = invoke<${type}>("./x.theta")`)),
    "union arm": lines(annotSrc(`${type} | null`)),
    "nested one level": lines(annotSrc(`{p: ${type}}`)),
    ".thetalib schema field": lines(`schema S { p: ${type} }\n`, "bug0176.thetalib"),
  };
}

/** The same eleven positions read at CODE level — no registry dependency (cell A2). */
function positionCodes(type: string): Record<string, string[]> {
  return {
    "@<T> annotation root": codes(annotSrc(type)),
    "let annotation": codes(body(`let x: ${type} = 1`)),
    "schema body field": codes(body(`schema S { p: ${type} }`)),
    "fn parameter": codes(body(`fn f(p: ${type}) { 1 }`)),
    "fn return": codes(body(`fn f(): ${type} { 1 }`)),
    "alias RHS": codes(body(`schema S = ${type}`)),
    "params: field": codes(paramsSrc(`  p: '${type}'`)),
    "invoke<T>": codes(body(`let r = invoke<${type}>("./x.theta")`)),
    "union arm": codes(annotSrc(`${type} | null`)),
    "nested one level": codes(annotSrc(`{p: ${type}}`)),
    ".thetalib schema field": codes(`schema S { p: ${type} }\n`, "bug0176.thetalib"),
  };
}

/** One expected list repeated across all eleven positions — type-system.md:15's claim. */
function atEveryPosition(expected: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(POSITION_LABELS.map((label) => [label, [...expected]]));
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

/** The quoted-key fragment the `@<T>` root lowers — 0176 §Reproduction (c) row L1. */
const L1_FRAGMENT = {
  type: "object",
  properties: { '"a"': { type: "string" } },
  required: ['"a"'],
  additionalProperties: false,
} as const;

/** The `$defs` name every hoisting position mints for it (schema-subset.md:73). */
const L1_SLUG = "__inline_ab25cb236d1e93a1";

// ===========================================================================
// (A) THE ELEVEN POSITIONS — 0176 §Reproduction (a). §Fix route A requires the
// refusal "at every `Type` position and every nesting depth reachable through
// inline object fields and union arms", which is the reach
// `theta/parse/duplicate-inline-field-name` and
// `theta/parse/empty-schema-body` already have (type-system.md:15). A fix
// measured at the annotation root alone cannot distinguish a rule change from a
// call-site change, so the claim is a whole-map equality over eleven cells:
// separate assertions would stop at the first divergence and hide the rest.
// RED at HEAD: A0 (no such registry row), A1 and A2 (every position `[]`).
// ===========================================================================

describe("bug 0176 (A) — a single quoted inline field name is refused at every `Type` position", () => {
  it("RED A0: the registry carries the new row, E, parse, with its normative Message (DIAG-2)", () => {
    // DIAG-2: adding a code is a spec change that lands in the same commit as
    // the code that emits it. Asserted first and on its own so the registry
    // half of the fix is a named red rather than a confusing failure inside
    // every other cell's expectation builder.
    const row = REGISTRY.find((r) => r.code === QUOTED_INLINE);
    expect(
      row,
      "A0 — docs/spec_topics/diagnostics/code-registry-parse.md must carry the " +
        `${QUOTED_INLINE} row; the registry is closed (DIAG-2, diagnostic-shape.md:72), so the ` +
        "row and the emission land together",
    ).toBeDefined();
    expect(
      registryMessage(REGISTRY, QUOTED_INLINE),
      "A0 — and its *Message* is normative (DIAG-4, diagnostic-shape.md:74): the subject is " +
        "the entry's raw pre-colon text, rendered verbatim by a row-scoped `<field>` carve-out " +
        "beside the duplicate row's (placeholder-rendering-b.md:10)",
    ).toBe(
      "quoted field name '<field>' within one inline object type; field names are identifiers",
    );
  });

  it('RED A1: `{"a": string}` draws exactly one line at all eleven positions', () => {
    // `grammar.md:101` refers the inline field to the object-schema `Field`
    // form and `schemas.md:17` fixes a field name there as an identifier; a
    // `"a"` token is not one, so the document does not load — at the eight
    // ordinary positions, at the union arm, one nesting down, and on the
    // `.thetalib` surface alike (type-system.md:15).
    expect(
      positions('{"a": string}'),
      "A1 — one non-repeating quoted key is one line per position; the eleven positions run " +
        "one type grammar, so a fix at the shared walk answers alike everywhere and a fix at " +
        "one call site cannot",
    ).toEqual(atEveryPosition([quotedLine('"a"')]));
  });

  it('RED A2: the same eleven positions at CODE level, and the theta stops registering', () => {
    // The registry-independent half of A1: this cell reds on the MISSING
    // REFUSAL alone, with no dependency on the new row's *Message* text, so the
    // parse-gate half of the fix has its own witness while the registry half is
    // outstanding.
    expect(
      positionCodes('{"a": string}'),
      "A2 — the emitted code at every position is the new row's, and nothing else: the quoted " +
        "key is refused by the shape test at `inlineObjectFieldKeys` " +
        "(src/parser/type-grammar.ts:656) behind the two existing gates " +
        "(:838), not by a residue sink",
    ).toEqual(atEveryPosition([QUOTED_INLINE]));

    // GOV-15's loads-cleanly predicate (source-language-stability.md:9) is what
    // withholds the theta and so keeps the lowering of group (C) unreached
    // through the load path.
    for (const src of [annotSrc('{"a": string}'), body('schema S { p: {"a": string} }')]) {
      expect(
        registersCleanly(parseDoc(src, "bug0176.theta")),
        "A2 — an error-severity diagnostic is the observable that leaves GOV-15's input set; " +
          `every newly-refused spelling of group (F) is inside it today. source=${JSON.stringify(src)}`,
      ).toBe(false);
    }
  });
});

// ===========================================================================
// (B) THE DECLARATION POSITION DOES NOT MOVE — 0176 §Fix A5, over
// §Reproduction (b) rows b1–b6. Five of these are cell G1 of the landed 0159
// witness; b4 is measured for this filing. `checkObjectSchema`
// (src/parser/schema-declarations.ts) and `emptySchemaBodyDiagnostic` are not
// edited: the `'S' has no fields` message over a body that declares one is bug
// 0133's subject, and this fix answers only the disagreement between the two
// positions.
// GREEN now and after — byte-identical.
// ===========================================================================

describe("bug 0176 (B) — the declaration spelling of the same text is byte-identical", () => {
  it("CONTROL B1: all six declaration rows keep exactly the lines they have", () => {
    const cells: ReadonlyArray<readonly [decl: string, want: string[]]> = [
      ['schema S { "a": string }', [emptyBodyLine("S")]],
      ['schema S { "a": string, "a": integer }', [emptyBodyLine("S")]],
      ['schema S { "a": string, b: integer }', [emptyBodyLine("S")]],
      // b4: a quoted name anywhere in the body discards the whole field list,
      // not only a body whose FIRST token is quoted.
      ['schema S { b: integer, "a": string }', [emptyBodyLine("S")]],
      // b5 and b6 bound b1–b4 to the quoted NAME: an identifier field and a
      // rename whose wire name is quoted both load at the declaration position.
      ["schema S { a: string }", []],
      ['schema S { a as "w": string }', []],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [decl, want] of cells) {
      actual[decl] = lines(body(decl));
      expected[decl] = want;
    }
    expect(
      actual,
      "B1 — the fix adds an emission at the inline positions and moves nothing here; a red in " +
        "this cell means it reached into bug 0133's recovery path (§Fix A5)",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (C) WHAT THE REFUSAL PREVENTS — 0176 §Reproduction (c). After the fix the
// refused source mints nothing at load, so these bytes are reachable only by a
// DIRECT lowerer call, exactly as cells k2 and B2 of the two landed siblings
// pin their own prevented artefacts. Both lowerers are frozen (0052 §Fix
// constraint 1), so every fragment here is byte-unchanged by the fix.
// GREEN now and after.
// ===========================================================================

describe("bug 0176 (C) — the quoted-key fragment the lowerers mint, by direct call", () => {
  it("CONTROL C1: the annotation root's own lowering IS the document root", () => {
    // L1. `lowerQueryResponseSchema` (src/runtime/query-schema-lowering.ts:153)
    // returns the inline body as the compiled document root rather than a `$ref`
    // wrapper, which is why group (D) can compile it directly.
    expect(
      lowerQueryResponseSchema('{"a": string}', [], []),
      "C1 — the property name is the three characters `\"a\"`, quote characters included: " +
        "`lowerInlineObject` (src/parser/body-type-lowering.ts:173) keys `properties` and " +
        "`required` on the entry's raw pre-colon text after `trim()`",
    ).toEqual(L1_FRAGMENT);
  });

  it("CONTROL C2: every hoisting position mints the same bytes under one content-addressed name", () => {
    // L2, L5, L6, L7 — the nested, alias, union and two-field shapes, all by
    // direct call. `__inline_ab25cb236d1e93a1` is the canonical hash of the
    // quoted-key fragment (schema-subset.md:73), so every position addresses one
    // `$defs` entry.
    const defs = { [L1_SLUG]: L1_FRAGMENT } as Record<string, unknown>;
    const actual: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    const cells: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      [
        '{p: {"a": string}}',
        {
          type: "object",
          properties: { p: { $ref: `#/$defs/${L1_SLUG}` } },
          required: ["p"],
          additionalProperties: false,
          $defs: defs,
        },
      ],
      // L6, the union arm.
      [
        '{"a": string} | null',
        { anyOf: [{ $ref: `#/$defs/${L1_SLUG}` }, { type: "null" }], $defs: defs },
      ],
      // L7, two fields of the same inline type — two properties, ONE `$defs`
      // entry.
      [
        '{p: {"a": string}, q: {"a": string}}',
        {
          type: "object",
          properties: { p: { $ref: `#/$defs/${L1_SLUG}` }, q: { $ref: `#/$defs/${L1_SLUG}` } },
          required: ["p", "q"],
          additionalProperties: false,
          $defs: defs,
        },
      ],
    ];
    for (const [type, fragment] of cells) {
      actual[type] = lowerQueryResponseSchema(type, [], []);
      expected[type] = fragment;
    }
    expect(
      actual,
      "C2 — one source text, one `__inline_<slug>` name, at every hoisting position; these " +
        "are the bytes the refusal keeps from being minted through a load",
    ).toEqual(expected);
  });

  it("CONTROL C3: the body-type map and the `params:` lowerer key the same text", () => {
    // L3 and L4, by DIRECT call rather than through a parsed document: after the
    // fix neither position mints anything for this source, so a document-path
    // read-back could not stay green. `buildBodyTypeSchemas`
    // (src/parser/body-type-lowering.ts:428) is handed the field source a
    // `schema S { p: {"a": string} }` body would retain, and
    // `lowerParamsFieldType` (src/parser/params.ts) is handed the `params:`
    // field's own type source.
    expect(
      Object.fromEntries(
        buildBodyTypeSchemas(
          [{ name: "S", fields: [{ name: "p", typeSource: '{"a": string}' }] }],
          [],
        ).entries(),
      ),
      "C3 — the body-type map hoists the same fragment under the same name (L4)",
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
      lowerParamsFieldType('{"a": string}', ctx),
      "C3 — the `params:` field lowers to a `$ref` at the same content-addressed name (L3)",
    ).toEqual({ $ref: `#/$defs/${L1_SLUG}` });
    expect(
      defs,
      "C3 — and registers the same fragment bytes in the document's `$defs`, so the `params:` " +
        "document of §Reproduction (c) row L3 is byte-identical to L2",
    ).toEqual({ [L1_SLUG]: L1_FRAGMENT });
    expect(unresolved, "C3 — the quoted key resolves no named type, so nothing is unresolved").toEqual(
      [],
    );
  });
});

// ===========================================================================
// (D) AJV, DRIVEN THROUGH THE PRODUCTION SEAM — 0176 §Reproduction (d) rows
// v1–v4 (plus v5/v6 at a nesting). A single quoted field repeats nothing, so
// `required` carries no duplicate item and the fragment is a VALID JSON Schema
// document: this class never reaches the meta-schema throw 0052 and 0159
// measured. It compiles, and it enforces a property spelled with its quotes. No
// route adds a `catch` at any AJV seam; route A removes the outcome by refusing
// the input, so this group is a prevented-artefact control reached by direct
// call.
// GREEN now and after.
// ===========================================================================

describe("bug 0176 (D) — the fragment compiles cleanly and is unsatisfiable by the author's field name", () => {
  it("CONTROL D1: v1–v4 at the annotation root", () => {
    const { validator, emitted } = ajv();
    // v1 — compiles, no throw, no diagnostic.
    const compiled = validator.compile(L1_FRAGMENT as unknown as LoweredSchema);
    expect(
      emitted.map((d) => d.code),
      "D1 v1 — `#build` (src/seams/schema-validator.ts:441) compiles the document with no " +
        "meta-schema complaint and no cache-collision diagnostic",
    ).toEqual([]);

    // v2 — ordinary JSON naming the field the author WROTE: rejected twice over.
    expect(
      compiled.validate({ a: "s" }),
      "D1 v2 — the payload spelling the author's field name draws both the missing quoted " +
        "property and the additional-property refusal; this is the verdict the repair loop of " +
        "group (E) then spends its whole budget on",
    ).toEqual({
      ok: false,
      errors: [
        {
          instancePath: "",
          schemaPath: "#/required",
          keyword: "required",
          message: 'must have required property \'"a"\'',
          params: { missingProperty: '"a"' },
        },
        {
          instancePath: "",
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          message: "must NOT have additional properties",
          params: { additionalProperty: "a" },
        },
      ],
    });

    // v3 — the schema's OWN escaped key validates, and lexical.md:13 admits no
    // quote character in an identifier, so no theta expression can address the
    // property this payload supplies.
    expect(
      compiled.validate({ '"a"': "s" }),
      "D1 v3 — the only payload the fragment accepts names a property no theta identifier can " +
        "spell (schemas.md:39 reserves that to `as \"WireName\"`)",
    ).toEqual({ ok: true });

    // v4 — the empty payload draws the required error alone.
    expect(compiled.validate({}), "D1 v4 — one required error, no additional-property one").toEqual({
      ok: false,
      errors: [
        {
          instancePath: "",
          schemaPath: "#/required",
          keyword: "required",
          message: 'must have required property \'"a"\'',
          params: { missingProperty: '"a"' },
        },
      ],
    });
  });

  it("CONTROL D2: v5–v6 — the hoisted document enforces the same key one level down", () => {
    const nested = lowerQueryResponseSchema('{p: {"a": string}}', [], []) as LoweredSchema;
    const compiled = ajv().validator.compile(nested);
    expect(
      compiled.validate({ p: { a: "s" } }),
      "D2 v5 — the same two errors at `instancePath` `/p`, through the `$defs` member",
    ).toEqual({
      ok: false,
      errors: [
        {
          instancePath: "/p",
          schemaPath: `#/$defs/${L1_SLUG}/required`,
          keyword: "required",
          message: 'must have required property \'"a"\'',
          params: { missingProperty: '"a"' },
        },
        {
          instancePath: "/p",
          schemaPath: `#/$defs/${L1_SLUG}/additionalProperties`,
          keyword: "additionalProperties",
          message: "must NOT have additional properties",
          params: { additionalProperty: "a" },
        },
      ],
    });
    expect(
      compiled.validate({ p: { '"a"': "s" } }),
      "D2 v6 — and the escaped key is accepted at the nesting too",
    ).toEqual({ ok: true });
  });
});

// ===========================================================================
// (E) THE END-TO-END TYPED-QUERY DRIVE — 0176 §Reproduction (e) row r1, through
// the real `buildTypedQueryValidation` (src/runtime/typed-query-validation.ts:168)
// and the real `runRespondRepairLoop` (src/runtime/query-respond-repair.ts:201)
// with a SCRIPTED follow-up drive. No provider is involved: the drive returns a
// fixed reply text, so the whole outcome is deterministic and offline. This is
// the runtime consequence the refusal removes — the author's defect is one
// quoted character pair in the source, and the report today is a validation
// error naming a property name the author never wrote.
// GREEN now and after (reached by direct construction, not through a load).
// ===========================================================================

describe("bug 0176 (E) — the honest payload burns the whole repair budget", () => {
  it("CONTROL E1 (row r1): three follow-ups, then Err(ValidationError { schema_validation })", async () => {
    const prompts: string[] = [];
    const validation = buildTypedQueryValidation({
      lowered: L1_FRAGMENT as unknown as LoweredSchema,
      resolveShape: () => undefined,
      schemaValidator: ajv().validator,
      // The declared default budget (frontmatter-fields-a.md:17, :45).
      attempts: 3,
      maxRounds: 4,
      driveFollowUp: (prompt) => {
        prompts.push(prompt);
        return Promise.resolve('{"a": "hello"}');
      },
    });

    const opening = validation.validate(
      L1_FRAGMENT as unknown as LoweredSchema,
      { a: "hello" },
    );
    expect(
      opening,
      "E1 — the opening validation of the payload naming the author's field reports the same " +
        "two issues group (D) row v2 measures",
    ).toEqual({
      ok: false,
      issues: [
        { path: "", message: 'must have required property \'"a"\'', schema_keyword: "required" },
        { path: "", message: "must NOT have additional properties", schema_keyword: "additionalProperties" },
      ],
      raw_response: '{"a":"hello"}',
    });
    expect(opening.ok, "E1 — the opening attempt must fail, or there is no repair to drive").toBe(
      false,
    );
    if (opening.ok) {
      // Loud, not a skip (CLAUDE.md §Testing): a passing opening validation
      // means the fragment no longer enforces the quoted key, which is a
      // different report's subject and must not read as a green repair drive.
      throw new Error(
        "E1 — the opening validation accepted the author's own field name; the whole repair " +
          "drive below asserts nothing without that failure",
      );
    }

    const outcome = await validation.runRespondRepair({
      kind: "schema_validation",
      issues: opening.issues,
      raw_response: opening.raw_response,
    });
    expect(
      outcome,
      "E1 — every follow-up fails identically and `terminalValidationError` " +
        "(src/runtime/query-respond-repair.ts:282) surfaces the terminal " +
        "`ValidationError`; the cost scales with whatever budget the theta configures",
    ).toEqual({
      kind: "validation",
      error: {
        kind: "validation",
        cause: "schema_validation",
        message: "typed query response failed schema validation",
        attempts: 3,
        validation_errors: [
          { path: "", message: 'must have required property \'"a"\'', schema_keyword: "required" },
          { path: "", message: "must NOT have additional properties", schema_keyword: "additionalProperties" },
        ],
        raw_response: '{"a":"hello"}',
      },
    });
    expect(
      prompts.length,
      "E1 — the whole three-follow-up budget is spent before the query reports",
    ).toBe(3);
    expect(
      prompts[0],
      "E1 — and the loop's own instruction renders the escaped key back to the model, so the " +
        "repair asks for a property name the author did not write",
    ).toContain('must have required property \'"a"\'');
    expect(
      prompts[0],
      "E1 — the rendered schema in the follow-up carries the quoted property name",
    ).toContain('\\"a\\"');
  });
});

// ===========================================================================
// (F) QUOTE STYLE AND THE EMPTY SPELLING — 0176 §Reproduction (f) rows f1–f7,
// each with its post-fix verdict. This table IS the §Fix A7 enumeration of the
// newly-refused spellings: GOV-15's diagnostic-registry carve-out
// (source-language-stability.md:25) dispositions a code ADDITION for inputs that
// did not previously emit it, and every row here loads cleanly today (:9), so
// the fix enumerates them rather than leaving them to be discovered.
//
// The emission set is A3's NARROW answer: a key whose FIRST character is `"` or
// `'`. Rows f6 and f7 bound it — the bare `a`/`b` keys beside a quoted one draw
// nothing, so the refusal is per-key and not per-body.
// RED at HEAD: every row reports `[]`.
// ===========================================================================

describe("bug 0176 (F) — every quote style, the empty key, padding, and the mixed bodies", () => {
  it("RED F1: the seven quote-style rows and their post-fix verdicts", () => {
    const cells: ReadonlyArray<readonly [type: string, want: string[]]> = [
      // f1 — the subject.
      ['{"a": string}', [quotedLine('"a"')]],
      // f2 — the single-quoted spelling is the same key shape, newly refused.
      ["{'a': string}", [quotedLine("'a'")]],
      // f3 — the empty-string key is a key, and its first character is a quote.
      ['{"": string}', [quotedLine('""')]],
      // f4 — a quoted key that could not be an identifier even unquoted.
      ['{"a-b": string}', [quotedLine('"a-b"')]],
      // f5 — `trim()` absorbs the padding, so the subject is the bare key text;
      // the annotation root's capture joins token texts and never sees it.
      ['{"a" : string}', [quotedLine('"a"')]],
      // f6 — one quoted key beside an identifier key: refused ONCE, on the
      // quoted one.
      ['{"a": string, b: integer}', [quotedLine('"a"')]],
      // f7 — the identifier key first: refused once, on the quoted key alone,
      // in source order.
      ['{a: integer, "a": string}', [quotedLine('"a"')]],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [type, want] of cells) {
      actual[type] = lines(annotSrc(type));
      expected[type] = want;
    }
    expect(
      actual,
      "F1 — the refusal is keyed on the KEY's first character, so quote style, emptiness, an " +
        "unspellable interior and padding all answer alike, and an identifier key beside a " +
        "quoted one draws nothing",
    ).toEqual(expected);
  });

  it("CONTROL F2: what each of those rows lowers today, by direct call", () => {
    // The prevented artefacts beside F1's refusals: each row mints a property
    // name carrying the author's quote characters, and rows f6/f7 mint it beside
    // a legitimate one. Frozen bytes — the fix refuses the input and edits no
    // lowerer.
    const actual: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    const cells: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ['{"a": string}', L1_FRAGMENT],
      [
        "{'a': string}",
        {
          type: "object",
          properties: { "'a'": { type: "string" } },
          required: ["'a'"],
          additionalProperties: false,
        },
      ],
      [
        '{"": string}',
        {
          type: "object",
          properties: { '""': { type: "string" } },
          required: ['""'],
          additionalProperties: false,
        },
      ],
      [
        '{"a-b": string}',
        {
          type: "object",
          properties: { '"a-b"': { type: "string" } },
          required: ['"a-b"'],
          additionalProperties: false,
        },
      ],
      ['{"a" : string}', L1_FRAGMENT],
      [
        '{"a": string, b: integer}',
        {
          type: "object",
          properties: { '"a"': { type: "string" }, b: { type: "integer" } },
          required: ['"a"', "b"],
          additionalProperties: false,
        },
      ],
      [
        '{a: integer, "a": string}',
        {
          type: "object",
          properties: { a: { type: "integer" }, '"a"': { type: "string" } },
          required: ["a", '"a"'],
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
      "F2 — row f7's two properties are the same value under two names, neither of which the " +
        "author can select between from theta; row f5 shows the padding never reaches the key",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (G) THE CLOSED DUPLICATE FACE — 0176 §Reproduction (g) rows c1–c5, and the
// settled PRECEDENCE. A key that repeats within one interior keeps
// `theta/parse/duplicate-inline-field-name` ALONE and draws nothing from the new
// row: those inputs are already refused, the remedy is the same, and a second
// line would say twice what one line says. c5 is the one row where the settled
// key admits two spellings of one intended wire name — two DISTINCT
// non-repeating quoted keys — so it draws two lines from the new row and none
// from the duplicate row.
// G1 is GREEN now and after; G2 is RED at HEAD (`[]` today).
// ===========================================================================

describe("bug 0176 (G) — a repeated key keeps its duplicate line alone", () => {
  it("CONTROL G1: c1–c4 keep exactly one duplicate line each", () => {
    const cells: ReadonlyArray<readonly [type: string, want: string[]]> = [
      ['{"a": string, "a": integer}', [dupLine('"a"')]],
      ["{'a': string, 'a': integer}", [dupLine("'a'")]],
      ['{"": string, "": integer}', [dupLine('""')]],
      // Padding absorbed by the trim, so this is the same one key twice.
      ['{"a" : string, "a" : integer}', [dupLine('"a"')]],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [type, want] of cells) {
      actual[type] = lines(annotSrc(type));
      expected[type] = want;
    }
    expect(
      actual,
      "G1 — bug 0159's row already refuses these at every position; the new row is subordinate " +
        "to it on a repeated key, so cell d5 of " +
        "tests/inline-object-duplicate-field-name.test.ts gains no second line",
    ).toEqual(expected);
  });

  it("RED G2 (row c5): `{\"a\": string, 'a': integer}` is two distinct quoted keys, so TWO lines", () => {
    // The settled comparison key does not unquote, so these two entries are two
    // keys and neither repeats — which is why the duplicate row is silent here
    // and why the new row must speak twice, in source order.
    expectList(
      annotSrc(`{"a": string, 'a': integer}`),
      [quotedLine('"a"'), quotedLine("'a'")],
      "G2 — two quote styles are two distinct raw keys (0159's settled key, its cell B1), so " +
        "this is the one closed-duplicate row the new refusal reaches, once per offending key " +
        "in source order",
    );
  });
});

// ===========================================================================
// (H) BOUNDARIES MEASURED, NOT ASSUMED — 0176 §Reproduction (h). Route A's
// detection site (ii) is `inlineObjectFieldKeys`, whose two skips do this
// boundary work for free: an entry with no top-level `:` yields no key (h1), and
// `{ a: }`'s key is the identifier `a` (h2). h4 — RE-PINNED for bug 0233
// (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md): the
// generic-argument gate this rule used to share with the duplicate rule is
// gone from `walkType`'s raw-key loop, so the quoted key inside `array<{"a":
// string}>` is now refused exactly as it is at any other position; the
// LOWERING still never divides that interior into fields (asserted below via
// the unmoved read-back), which bounds the wire consequence, not whether the
// source is judged. h5 is bug 0160's subject and the narrow A3 answer's whole
// point: the raw key `a as "w"` does not START with a quote, so it is not
// refused.
// GREEN now and after for h1–h3; RED for h4.
// ===========================================================================

describe("bug 0176 (H) — 0045's reserved shapes are untouched, the generic argument now refuses (bug 0233), and 0160's subject stays 0160's", () => {
  it("H1: h1–h3 keep their silence and their lowered bytes; h4's generic argument is now refused (bug 0233)", () => {
    const cells: ReadonlyArray<
      readonly [type: string, lines: readonly string[], lowered: Record<string, unknown>]
    > = [
      // h1 / h2 — 0045's reserved shapes: silent, and minting NO property. That
      // is the observable that keeps them a different class from this report's
      // subject, which mints one whose name carries quote characters.
      [
        "{ a }",
        [],
        { type: "object", properties: {}, required: [], additionalProperties: false },
      ],
      [
        "{ a: }",
        [],
        { type: "object", properties: {}, required: [], additionalProperties: false },
      ],
      [
        "{ a, b: integer }",
        [],
        {
          type: "object",
          properties: { b: { type: "integer" } },
          required: ["b"],
          additionalProperties: false,
        },
      ],
      // h4 — bug 0233: refused now, since the raw-key loop no longer withholds
      // an object reached through a generic type argument. The LOWERING is
      // unmoved: the interior is still never divided into fields, so `items`
      // is still the permissive `{}`.
      ['array<{"a": string}>', [quotedLine('"a"')], { type: "array", items: {} }],
    ];
    const actualLines: Record<string, string[]> = {};
    const expectedLines: Record<string, string[]> = {};
    const actualLowered: Record<string, unknown> = {};
    const expectedLowered: Record<string, unknown> = {};
    for (const [type, want, lowered] of cells) {
      actualLines[type] = lines(annotSrc(type));
      expectedLines[type] = [...want];
      actualLowered[type] = lowerQueryResponseSchema(type, [], []);
      expectedLowered[type] = lowered;
    }
    expect(
      actualLines,
      "H1 — a refusal at `inlineObjectFieldKeys` sees no key at all for `{ a }`, an identifier " +
        "key for `{ a: }`; a red on either means the fix was keyed at `parseObject`'s tolerant " +
        "`else` branch instead (§Fix A1 site (i)) and widened into 0045's reserved family. A `[]` " +
        "on the generic-argument cell is bug 0233's withheld gate returning",
    ).toEqual(expectedLines);
    expect(
      actualLowered,
      "H1 — and the read-backs that make the silences — and the generic argument's unmoved " +
        "lowering — facts rather than omissions",
    ).toEqual(expectedLowered);
  });

  it('CONTROL H2 (row h5): `{a as "w": integer}` is now refused by bug 0160, not by this row', () => {
    // RE-PINNED for bug 0160 (X.Y.Z). This row's own subject is unmoved: the
    // narrow A3 answer refuses a key whose FIRST character is a quote, this
    // key's first character is `a`, and `theta/parse/quoted-inline-field-name`
    // still says nothing about it — the `positions()` half below now names bug
    // 0160's row instead of `[]`, once per position, not a second line from
    // this one. The DIRECT lowering assertion stays byte-identical, which is
    // what proves this fix changed no lowering: the artefact is unreachable
    // through a load now, not rewritten.
    expect(
      positions('{a as "w": integer}'),
      "H2 — a refusal keyed on the whole key's SHAPE would take 0160's rename spelling with " +
        "it; the settled emission set is the narrow one, so THIS row does not move — bug 0160's " +
        "own row is what now fires here",
    ).toEqual(atEveryPosition([renLine("a")]));
    expect(
      lowerQueryResponseSchema('{a as "w": integer}', [], []),
      "H2 — reached by DIRECT construction only now that the load-path refusal withholds it: " +
        "the unparsed rename's own property name is unchanged, still the whole pre-colon text " +
        "(0160 §Reproduction rows L1–L6)",
    ).toEqual({
      type: "object",
      properties: { 'a as "w"': { type: "integer" } },
      required: ['a as "w"'],
      additionalProperties: false,
    });
  });
});
