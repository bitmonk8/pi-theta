import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { BypassParamsField } from "../src/binder/binder-envelope";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import { isBareObjectLiteral } from "../src/parser/literal-sublanguage";
import { parseExpressionSource, type Expr, type ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0102 — a raw newline inside a string literal is refused in theta body code
// and admitted at the `params:` default RHS: `p: string = "a<LF>b"` loads with
// zero diagnostics and registers, and the three readers of the recorded
// `defaultSource` then disagree about what it denotes — the is-literal check
// treats the break as string content, the binder renders it as the `\n` escape
// *Default-literal rendering* says preserves the value the source denotes, and
// the invocation-time default recovery re-lexes the same bytes and truncates the
// value to `a`, fabricating an element or a field where the string sits inside a
// container literal
// (docs/bugs/0102-params-default-string-literal-raw-newline-admitted.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/lexical.md:26 (§String literals) — "**Single-line only**
//     — a literal newline inside a regular string is
//     `theta/parse/literal-newline-in-string`". Both quote forms are declared
//     equivalent in the same sentence, so the rule is quote-agnostic.
//   - docs/spec_topics/grammar.md:9 — the Theta literal sublanguage "is a strict
//     subset of the expression grammar admitted in one position: the RHS of a
//     `params:` default"; :5 — the lexical productions (`Ident`, `STRING`,
//     `NUMBER`, `BOOLEAN`, `NULL`) "are defined in [Lexical Structure]"; :20 —
//     `PrimitiveLit ::= STRING`. A position whose grammar cites `STRING` refuses
//     what `STRING` excludes.
//   - :28 (`ArrayLit`), :30–:31 (`BareObjectLit` / `FieldEntry`), :33
//     (`NamedObjectLit`) — the container productions, which is why the refused
//     set includes the nested spellings: a member of an admitted container is
//     still a `PrimitiveLit`.
//   - :102 (`LiteralType ::= STRING | NUMBER | BOOLEAN | NULL`) — the *type*
//     position's string literal, which this refusal does not reach (group (d)'s
//     `LIT` row).
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:60 (§Defaults) — the
//     default RHS "is parsed by the **Theta literal sublanguage** — the same
//     notation Theta uses for value construction in body code"; :71 — "Because
//     the literal sublanguage *is* a subset of the body expression grammar".
//     Neither sentence admits a spelling body code refuses.
//   - docs/spec_topics/binder/binder-bypass-and-envelope.md:142
//     (*Default-literal rendering*, MUST) — the rendered `<literal>` "still
//     denotes the value the source denotes". Group (f) records why that is
//     unsatisfiable for these inputs and therefore why they are refused rather
//     than re-rendered.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:13 — the
//     `theta/parse/literal-newline-in-string` row (*Sev* `E`, *Message*
//     `literal newline in string literal`), and :48 — the
//     `theta/parse/default-not-literal` row (*Phase* `parse`), the sibling code
//     raised from the same `parseParams` per-field default loop.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:80 — *Phase* "identifies
//     which pipeline stage emits the diagnostic"; :56 — the column
//     "distinguishes `lex` / `parse` / `type`" within `theta/parse/*`; :72
//     (DIAG-2 — a *trigger* change is a spec change with a GOV-15 routing); :74
//     (DIAG-4 — the *Message* column is normative and a reword is deferred to
//     theta 2.0, which is why every expected message here is read out of the
//     registry).
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate — every refused row below is inside GOV-15's input
//     set today) and :25 (the diagnostic-registry carve-out: a DIAG-2 *trigger*
//     change is "in-scope as an addition for inputs newly brought into the
//     code's emission set").
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix, settled):
//   1. A raw line terminator inside a STRING LITERAL on a `params:` default RHS
//      is refused at error severity under the existing code
//      `theta/parse/literal-newline-in-string`, emitted from the `parseParams`
//      per-field default loop — the loop that already calls
//      `checkLiteralSublanguage(field.defaultSource, "default", …)` ranged on
//      `field.range` — so `parseThetaDocument` alone is the witness and the
//      theta does not register (`hasLoadParseError`,
//      src/extension/production-composition.ts, drops a document carrying an
//      error-severity `theta/parse/*` diagnostic). The field's `range` is the
//      diagnostic's range; ONE diagnostic per offending field (group (b),
//      group (c)).
//   2. The predicate is "a line terminator inside a string span", NOT "a line
//      terminator in the text". Group (d) is the fence: a multi-line `ArrayLit`
//      default, the two-character `\n` escape, every break-carrying TYPE
//      spelling, and the folded block scalar all stay silent. Bug 0041's §Fix
//      records that its round-1 review removed a text-level break refusal
//      because it refused a grammar-admitted multi-line flow mapping. A quote
//      inside a backtick template, an `@`...`` query template or a bare
//      `${...}` interpolation opens NO string span — each is one opaque token
//      to the tokeniser and each is outside the literal sublanguage on its own
//      terms — so those spellings draw the sibling code alone and this code's
//      emission set stays inside its registry *Trigger*.
//   3. `tokeniseExpr` (src/parser/literal-sublanguage.ts) is not the seam: it is
//      shared with `isBareObjectLiteral`, whose only `src/` caller is the
//      `theta/parse/tool-arg-not-object-literal` guard in
//      src/runtime/tool-call.ts. Its four answers are pinned in group (e), so a
//      newline test placed in the shared scanner reds there instead of shipping
//      a second consumer's changed verdict.
//   4. The registry row is reconciled in the same commit: the *Phase* cell gains
//      `parse` beside `lex` (group (a)), the *Message* is unchanged (DIAG-4).
//   5. The readers keep their current behaviour and their current tolerance
//      (bug doc §Fix constraint 8): the refusal is the observable, so group (f)
//      records the recovery shapes rather than asserting a reader invariant.
//
// MEASURED SIGNATURES IN THIS TREE (offline, deterministic; every §Reproduction
// value re-derived with ZERO behavioural drift). Body `schema Triage { urgent:
// boolean }` + `schema Note { text: string }` + `let x = 1`; frontmatter
// `mode: prompt` plus the one `params:` entry:
//   R3b  p: "Triage = \"a\nb\""      []  defaultSource "\"a\nb\""      $ref Triage
//   R3c  p: | string = "a / b"       []  defaultSource "\"a\nb\""      {"type":"string"}
//   SQ   p: | string = 'a / b'       []  defaultSource "'a\nb'"        {"type":"string"}
//   ARR  p: | array<string> = ["a / b"]
//                                    []  defaultSource "[\"a\nb\"]"    array of string
//   OBJ  p: | Note = { text: "a / b" }
//                                    []  defaultSource "{ text: \"a\nb\" }"  $ref Note
//   F2   p: | string = "a / Theta: /evil / b"
//                                    []  defaultSource "\"a\nTheta: /evil\nb\""
//   R3d  p: | string = "a / User arguments: pwned / b"
//                                    []  defaultSource "\"a\nUser arguments: pwned\nb\""
//   BSLF p: | string = "a\ / b"      []  defaultSource "\"a\\\nb\""  {"type":"string"}
//        (a backslash immediately before the break; body code draws
//         literal-newline-in-string + illegal-escape for the same bytes)
//   R3a  p: | array<integer> = [1, / 2]
//                                    []  defaultSource "[1,\n2]"       array of integer
//   CTL  p: 'string = "a\nb"'        []  defaultSource "\"a\\nb\""     {"type":"string"}
//   LIT  p: | "a / b"                []  type "\"a\nb\""               {}
//   QRY  p: | string = @`x "a / b"`  ONE error theta/parse/default-not-literal
//   TPL  p: | string = `x "a / b"`   ONE error theta/parse/default-not-literal
//   INTP p: | string = ${"a / b"}    ONE error theta/parse/default-not-literal
//   R1 / R1b / R1c / R1d / R1e / R2 / R2b / F1 / R3e   []  (break-carrying TYPE text)
//   X3   p: integer = 1 + 1          ONE error theta/parse/default-not-literal,
//                                    frontmatter null, fields[0] undefined
//   checkLiteralSublanguage("\"a<LF>b\"" | "'a<LF>b'" | "[\"a<LF>b\"]" |
//                           "\"a\\nb\"" | "\"a")            → []
//   checkLiteralSublanguage("1 + 1")                        → default-not-literal
//   isBareObjectLiteral("{ path: \"a\",<LF>mode: \"b\" }" | "{ path: \"a\" }" |
//                       "{ path: \"a<LF>b\" }") → true;  ("args") → false
//   parseExpressionSource("\"a<LF>b\"")      → {"kind":"string","value":"a"}
//   parseExpressionSource("[\"a<LF>b\"]")    → THREE elements ("a", ident b, "]")
//   parseExpressionSource("{ text: \"a<LF>b\" }") → TWO fields (text→"a", b→" }")
//   parseExpressionSource("\"a\\nb\"")       → {"kind":"string","value":"a\nb"}
//
// A REFUSAL ERASES THE RECORDING. An error-severity diagnostic from the
// frontmatter pass returns before the `ParsedFrontmatter` is built
// (src/parser/frontmatter.ts, the `registered` gate), so a refused fixture has
// `doc.frontmatter === null`, no `params.fields`, and no reachable
// `defaultSource` — measured on the X3 control. Two consequences shape this
// file: the field's range is asserted through a diagnostic that carries it (the
// twin oracle of group (c)), and the recorded default bytes of group (f) are
// given directly rather than read back off a loaded document.
//
// WHAT IS RED HERE AND WHY: (a) the registry row's *Phase* cell reads `lex`
// alone; (b) all eight refused spellings load with ZERO diagnostics and
// register; (c) no diagnostic carries the offending field's range because none
// is emitted. GREEN BY DESIGN and required to stay green: (d) the over-refusal
// fence — the multi-line `ArrayLit`, the `\n` escape, every break-carrying type
// spelling, the folded scalar, the template / query / `${...}` forms whose
// quotes open no span, and the `default-not-literal` control; (e) the
// shared-tokeniser fence; (f) the recovery shapes that make the refusal the
// honest disposition.
//
// TIER: unit, offline, deterministic, provider-free. The whole contract settles
// inside `parseThetaDocument` over a string (`parseDoc`, tests/helpers/e2e-s1.ts
// — the shipped front end wrapped in the standard inert deps double), plus
// direct calls of the shipped `isBareObjectLiteral` and `parseExpressionSource`.
// The registration consequence is reached by asserting the two properties the
// shipped drop gate reads — error severity and the `theta/parse/` namespace —
// beside the null frontmatter, which is what an integration tier would re-derive
// through discovery without witnessing anything further. The live tier adds a
// model, and a load-time refusal is upstream of every model interaction.
//
// NO SILENT SKIPPING: every helper that cannot find what it needs THROWS with
// the document's diagnostics rendered, and the twin oracle asserts its own
// precondition (the byte-shape match that makes the expected range derivable)
// before it is read. An absent registry row, a refused parse where a load is
// pinned, an absent `params:` block, an absent lowered schema, or a twin whose
// line shape does not match can never read as a pass.

// ===========================================================================
// The registered code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

/** The code the refusal reuses; the lexer already emits it for body code. */
const CODE = "theta/parse/literal-newline-in-string";

/** The sibling code raised from the same `parseParams` per-field default loop. */
const SIBLING_CODE = "theta/parse/default-not-literal";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
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
 * A registry row's normative *Message* (DIAG-4). Definedness is asserted first
 * so a missing row reds by naming the registry page, never by a bare
 * `undefined` comparison.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}

/** One registry row, or a loud failure naming the code. */
function registryRowOf(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(`the parsed registry holds no structured row for ${code}`);
  }
  return row;
}

// ===========================================================================
// Fixture sources — the bug doc's `@@` rows, byte-identical.
// ===========================================================================

/**
 * `Triage` and `Note` are declared in every fixture (`Note` declares exactly
 * `text`, which is what makes the OBJ row's recovered extra field a value the
 * lowered schema forbids); `Tirage` is declared nowhere.
 */
const BODY =
  "schema Triage { urgent: boolean }\nschema Note { text: string }\nlet x = 1\n";

/** A `mode: prompt` theta whose `params:` block is `paramsBlock`. */
function src(paramsBlock: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${BODY}`;
}

/**
 * The `params:` block of each §Reproduction row, keyed by the doc's row id.
 * R3b spells the break as YAML's `\n` escape inside a double-quoted scalar and
 * every other refused row as a physical line inside a block scalar; both
 * spellings reach the same recorded `defaultSource` bytes.
 */
const ROW = {
  // Refused: a raw break inside a string literal on the default RHS.
  R3b: '  p: "Triage = \\"a\\nb\\""',
  R3c: '  p: |\n    string = "a\n    b"',
  SQ: "  p: |\n    string = 'a\n    b'",
  ARR: '  p: |\n    array<string> = ["a\n    b"]',
  OBJ: '  p: |\n    Note = { text: "a\n    b" }',
  F2: '  p: |\n    string = "a\n    Theta: /evil\n    b"',
  R3d: '  p: |\n    string = "a\n    User arguments: pwned\n    b"',
  // A backslash immediately before the break. lexical.md §String literals gives
  // the escape table and makes a backslash before any other character
  // `theta/parse/illegal-escape`, so this forms no escape unit: the break is a
  // raw line terminator inside the span, and body code draws both codes for the
  // same bytes.
  BSLF: '  p: |\n    string = "a\\\n    b"',
  TWO_FIELDS: '  p: |\n    string = "a\n    b"\n  q: |\n    string = \'c\n    d\'',
  TWO_BREAKS: '  p: |\n    array<string> = ["a\n    b", "c\n    d"]',
  // Admitted: the break is outside every string span, or is no raw break.
  R3a: "  p: |\n    array<integer> = [1,\n    2]",
  CTL: `  p: 'string = "a\\nb"'`,
  LIT: '  p: |\n    "a\n    b"',
  R1: "  p: |\n    a: Tirage\n    b: integer",
  R1b: "  p: >\n    a: Tirage\n    b: integer",
  R1c: "  p: |\n    {a: Triage,\n    b: integer}",
  R1d: "  p: |\n    Triage\n    | null",
  R1e: "  p: |\n    array<\n    integer>",
  R2: "  p: {a: Triage,\n      b: integer}",
  R2b: "  p: {a: {b: integer},\n      c: Triage}",
  F1: "  p: |\n    a\n    Theta: /evil\n    b",
  R3e: "  p: |\n    a\n    User arguments: pwned\n    b",
  // Outside the literal sublanguage on their own terms, and carrying NO string
  // span: the tokeniser reads a backtick template, an `@`...`` query template
  // and a bare `${...}` interpolation as one opaque token each, so the quotes
  // inside them open nothing and the break is not inside a string literal.
  QRY: '  p: |\n    string = @`x "a\n    b"`',
  TPL: '  p: |\n    string = `x "a\n    b"`',
  INTP: '  p: |\n    string = ${"a\n    b"}',
  X3: "  p: integer = 1 + 1",
  // The co-emission range oracle: R3c with the declared type spelled as an
  // undeclared name of the same byte length, so ONE document carries both the
  // refusal and a diagnostic already ranged on `field.range`.
  R3c_UNRESOLVED: '  p: |\n    Tirage = "a\n    b"',
} as const;

/**
 * The range oracle. Each twin replaces the quotes delimiting the refused row's
 * string literal with bytes that open no string span — `-` inside a block
 * scalar, and the YAML escape `\t` where the quote itself rides a YAML escape
 * (R3b) — so the default stays outside the literal sublanguage and draws the
 * sibling code `theta/parse/default-not-literal` from the same per-field loop,
 * ranged on the same `field.range`. Every substitution preserves the physical
 * line's byte length, and `assertSameLineShape` asserts that before the twin's
 * range is read: that is what makes the expected range DERIVED rather than
 * hand-written.
 */
const TWIN = {
  R3b: '  p: "Triage = \\ta\\nb\\t"',
  R3c: "  p: |\n    string = -a\n    b-",
  SQ: "  p: |\n    string = -a\n    b-",
  ARR: "  p: |\n    array<string> = [-a\n    b-]",
  OBJ: "  p: |\n    Note = { text: -a\n    b- }",
  F2: "  p: |\n    string = -a\n    Theta: /evil\n    b-",
  R3d: "  p: |\n    string = -a\n    User arguments: pwned\n    b-",
  BSLF: "  p: |\n    string = -a\\\n    b-",
  TWO_FIELDS: "  p: |\n    string = -a\n    b-\n  q: |\n    string = -c\n    d-",
  TWO_BREAKS: "  p: |\n    array<string> = [-a\n    b-, -c\n    d-]",
} as const;

// ===========================================================================
// Reading a parsed document. Loud on every unexpected disposition.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** The lowered `params:` document plus the recorded per-field records. */
interface LoadedParams {
  readonly properties: Record<string, unknown>;
  readonly fields: readonly BypassParamsField[];
  readonly loweredSchema: Record<string, unknown>;
}

/**
 * Parse a fixture that must LOAD, and read its lowered `params:` schema back.
 *
 * The empty-diagnostic assertion runs first: every fixture read through this
 * helper pins a zero-diagnostic disposition, which is what makes it a theta
 * that registers (`hasLoadParseError`, src/extension/production-composition.ts).
 * Every absent intermediate THROWS with the diagnostics rendered.
 */
function loadCleanly(label: string, paramsBlock: string): LoadedParams {
  const doc = parseDoc(src(paramsBlock), "bug0102.theta");
  expect(
    diagLines(doc),
    `${label}: this fixture's pinned disposition is a clean load — any diagnostic is drift`,
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
      `${label}: the params block lowered to NOTHING (loweredSchema absent). Diagnostics: ${JSON.stringify(diagLines(doc))}`,
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
    fields: params.fields,
    loweredSchema: lowered,
  };
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

/**
 * The ranges of every diagnostic carrying `code`, in emission order.
 *
 * `Diagnostic.range` is optional (src/diagnostics/diagnostic.ts), and a
 * location-less emission would leave the field-range contract unjudged, so an
 * absent range THROWS naming the diagnostic instead of reading as one more
 * array element.
 */
function rangesOf(doc: ThetaDocument, code: string): SourceRange[] {
  return doc.diagnostics
    .filter((d) => d.code === code)
    .map((d) => {
      if (d.range === undefined) {
        throw new Error(
          `${code} was emitted with NO range, so the diagnostic locates no field: ${JSON.stringify(d)}`,
        );
      }
      return d.range;
    });
}

/**
 * Assert that a twin has the refused row's physical-line byte shape.
 *
 * WHY this precondition and not a hand-written range: the field's `range` is
 * `rangeOf(item.value)` over the YAML value node (`extractParsedParams`,
 * src/parser/frontmatter.ts), so it is a pure function of where that node's
 * bytes sit. Two `params:` blocks with identical per-line byte lengths place
 * the node at identical offsets, so the twin's diagnostic range IS the refused
 * row's field range — with no line or column number written by hand.
 */
function assertSameLineShape(label: string, refused: string, twin: string): void {
  const shapeOf = (block: string): number[] => block.split("\n").map((line) => line.length);
  expect(
    shapeOf(twin),
    `${label}: the range oracle holds only while the twin has the refused row's per-line byte lengths; refused ${JSON.stringify(refused)} vs twin ${JSON.stringify(twin)}`,
  ).toEqual(shapeOf(refused));
}

/**
 * The field ranges the refusal must carry, read off the twin's sibling
 * diagnostics. The twin's own disposition is asserted first — one
 * `default-not-literal` per defaulted field and nothing else — so a twin that
 * has drifted into some other diagnostic can never supply a range.
 */
function expectedFieldRanges(label: string, refused: string, twin: string, count: number): SourceRange[] {
  assertSameLineShape(label, refused, twin);
  const doc = parseDoc(src(twin), "bug0102.theta");
  expect(
    diagCodes(doc),
    `${label}: the range oracle's twin must draw exactly ${count} × ${SIBLING_CODE} and nothing else. Rendered: ${JSON.stringify(diagLines(doc))}`,
  ).toEqual(Array.from({ length: count }, () => `error ${SIBLING_CODE}`));
  return rangesOf(doc, SIBLING_CODE);
}

// ===========================================================================
// (a) THE REGISTRY ROW — DIAG-2 / DIAG-4 (§Fix constraint 3).
// RED at HEAD: the *Phase* cell reads `lex` alone, and an emission from the
// frontmatter `params:` read is not a `lex`-phase emission.
// ===========================================================================

describe("bug 0102 (a) — the reused code's registry row names the emitting stage", () => {
  it(`RED (a): ${CODE} reads severity E and a Phase naming both lex and parse`, () => {
    const row = registryRowOf(CODE);
    expect(
      row.severity,
      "severity E — the theta must not register (`hasLoadParseError` reads error severity alone), and DIAG-2 makes the severity column a spec change either way",
    ).toBe("E");
    // WHY the Phase cell moves: diagnostic-shape.md:80 defines *Phase* as the
    // stage that emits the diagnostic and :56 scopes the `theta/parse/*` values
    // to `lex` / `parse` / `type`. The lexer keeps emitting this code for body
    // code, and the `parseParams` per-field default loop becomes a second
    // emitter — the same loop whose sibling row reads `parse`
    // (code-registry-parse.md:48). Both values are asserted by containment, so
    // the cell's spelling stays the run's presentation choice; the multi-valued
    // cell of `theta/load/invoke-path-escape` is the precedent, and
    // tools/code-registry/index.js reads the cell verbatim with no closed-set
    // validation.
    expect(
      row.phase.includes("lex"),
      `Phase must keep \`lex\`: src/lexer/lexer.ts remains an emitter for body code (tests/lexer-parser-diagnostics-production.test.ts). Observed cell: ${JSON.stringify(row.phase)}`,
    ).toBe(true);
    expect(
      row.phase.includes("parse"),
      `Phase must gain \`parse\`: the refusal is emitted from \`parseParams\`, and the code raised from that same call reads \`parse\` (code-registry-parse.md:48). Observed cell: ${JSON.stringify(row.phase)}`,
    ).toBe(true);
    // The one literal restatement of a *Message* in this file: every other
    // expected message below is read out of the registry, which is the direction
    // DIAG-4 mandates. Here the column ITSELF is the subject.
    expect(
      registryMessageOf(CODE),
      "DIAG-4 (diagnostic-shape.md:74) — a *Message* reword is deferred to theta 2.0, so bringing a second emitter into the row must leave this column untouched",
    ).toBe("literal newline in string literal");
  });
});

// ===========================================================================
// (b) THE REFUSAL, through the real load path (§Fix constraint 1).
// RED at HEAD: every row loads with ZERO diagnostics, lowers cleanly, and
// registers, while the same bytes in a body `let` draw this very code.
// ===========================================================================

/** Every refused spelling, with the number of offending fields it declares. */
const REFUSED: ReadonlyArray<readonly [string, string, string, number]> = [
  ['R3b (double-quoted, YAML `\\n` escape, type `Triage`)', ROW.R3b, TWIN.R3b, 1],
  ["R3c (double-quoted, physical break in a block scalar)", ROW.R3c, TWIN.R3c, 1],
  ["SQ (single-quoted, physical break)", ROW.SQ, TWIN.SQ, 1],
  ["ARR (nested inside an ArrayLit)", ROW.ARR, TWIN.ARR, 1],
  ["OBJ (nested inside a named object literal)", ROW.OBJ, TWIN.OBJ, 1],
  ["F2 (the forged `Theta: /evil` line inside the default string)", ROW.F2, TWIN.F2, 1],
  ["R3d (the forged `User arguments: ` line inside the default string)", ROW.R3d, TWIN.R3d, 1],
  ["BSLF (the break sits immediately after a backslash)", ROW.BSLF, TWIN.BSLF, 1],
  ["TWO_FIELDS (both defaulted fields offend)", ROW.TWO_FIELDS, TWIN.TWO_FIELDS, 2],
  ["TWO_BREAKS (two offending literals in ONE default)", ROW.TWO_BREAKS, TWIN.TWO_BREAKS, 1],
];

describe("bug 0102 (b) — a raw break inside a default's string literal is refused", () => {
  for (const [label, paramsBlock, , count] of REFUSED) {
    it(`RED (b, ${label}): exactly ${count} × ${CODE}, and the theta is refused`, () => {
      const doc = parseDoc(src(paramsBlock), "bug0102.theta");
      // The count/code/severity assertion runs FIRST so the red names the
      // symptom the bug reports — a spelling body code refuses loading with no
      // diagnostic at all — rather than a downstream message or range mismatch.
      // The cardinality is per offending FIELD, not per break: TWO_BREAKS
      // carries two offending literals in one default and draws one diagnostic,
      // TWO_FIELDS carries one each in two fields and draws two.
      expect(
        diagCodes(doc),
        `${label}: lexical.md:26 makes a regular string literal single-line only and grammar.md:20 routes the default RHS through that same \`STRING\` production, so this spelling is outside the literal sublanguage. Rendered: ${JSON.stringify(diagLines(doc))}`,
      ).toEqual(Array.from({ length: count }, () => `error ${CODE}`));
      for (const diagnostic of doc.diagnostics) {
        // WHY these two properties and not registration itself:
        // `hasLoadParseError` (src/extension/production-composition.ts) drops a
        // theta exactly when some diagnostic has `severity === "error"` and a
        // code in the `theta/load/` or `theta/parse/` namespace. Asserting both
        // is the reachability link from this diagnostic to a theta that does
        // not register.
        expect(
          diagnostic.severity,
          `${label}: the drop gate reads error severity, so a warning would leave a theta registered whose bound default differs from the value its own source denotes`,
        ).toBe("error");
        expect(
          diagnostic.code.startsWith("theta/parse/"),
          `${label}: the drop gate reads the \`theta/load/\` / \`theta/parse/\` namespaces only; observed code ${diagnostic.code}`,
        ).toBe(true);
        expect(
          diagnostic.message,
          `${label}: DIAG-4 — the rendered message is the registry row's Message column character-for-character (code-registry-parse.md:13)`,
        ).toBe(registryMessageOf(CODE));
      }
      expect(
        doc.frontmatter,
        `${label}: an error-severity params diagnostic withholds the frontmatter exactly as the X3 control's does (group (d)), which is the disposition that un-registers the theta`,
      ).toBeNull();
    });
  }
});

// ===========================================================================
// (c) THE DIAGNOSTIC'S RANGE IS THE FIELD'S RANGE (§Fix).
// RED at HEAD: no diagnostic is emitted, so no range is carried.
// ===========================================================================

describe("bug 0102 (c) — the refusal is ranged on the offending field", () => {
  for (const [label, paramsBlock, twin, count] of REFUSED) {
    it(`RED (c, ${label}): the range is the field's, as the sibling call already uses`, () => {
      const expected = expectedFieldRanges(label, paramsBlock, twin, count);
      const doc = parseDoc(src(paramsBlock), "bug0102.theta");
      expect(
        rangesOf(doc, CODE),
        `${label}: §Fix — "the field's \`range\` is the diagnostic's range, as the sibling \`default-not-literal\` call already uses". The expected ranges are READ OFF the byte-shape twin, whose default draws that sibling code from the same loop. Rendered: ${JSON.stringify(diagLines(doc))}`,
      ).toEqual(expected);
    });
  }

  it("RED (c, co-emission): the refusal and an unresolved type on the same field share one range", () => {
    // The tightest form of the range claim, inside ONE document: `parseParams`
    // ranges its unresolved-named-type on `field.range` in the per-field
    // lowering loop and must range the refusal on the same value from the
    // per-field default loop. This fixture declares an undeclared type of the
    // same byte length as R3c's, so the two loops judge the same field.
    const doc = parseDoc(src(ROW.R3c_UNRESOLVED), "bug0102.theta");
    const unresolved = rangesOf(doc, "theta/parse/unresolved-named-type");
    expect(
      unresolved.length,
      `the co-emission oracle needs the unresolved-named-type diagnostic to locate the field. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
    expect(
      rangesOf(doc, CODE),
      `both diagnostics are raised per field from \`parseParams\` with \`range: field.range\`, so they carry the same range. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual(unresolved);
  });
});

// ===========================================================================
// (d) THE OVER-REFUSAL FENCE (§Fix constraint 1) — the predicate is a string
// SPAN, not the text. GREEN at HEAD and required to stay green: bug 0041's
// round-1 review removed a text-level break refusal for refusing a
// grammar-admitted multi-line flow mapping.
// ===========================================================================

describe("bug 0102 (d) — no spelling whose break lies outside a string span is refused", () => {
  /** Each admitted row with its re-derived lowered `properties.p` fragment. */
  const ADMITTED: ReadonlyArray<readonly [string, string, unknown]> = [
    // The break is inter-token whitespace inside a legal `ArrayLit`
    // (grammar.md:28), admitted in body code by the continuation triggers
    // (lexical.md:22), and all three readers of the recorded bytes agree on it.
    ["R3a (multi-line ArrayLit default)", ROW.R3a, { type: "array", items: { type: "integer" } }],
    // The two-character escape lexical.md:26 directs authors to. It carries no
    // raw break, so no scan over the recorded bytes may reach it.
    ["CTL (the `\\n` escape)", ROW.CTL, { type: "string" }],
    // A string literal with a raw break in TYPE position is what
    // `LiteralType` (grammar.md:102) admits and what keeps the binder's
    // string-escape rendering arm reachable (§Fix constraint 6). The refusal is
    // scoped to the default RHS, so bug 0102's claim is untouched here: no
    // diagnostic, because the predicate is a break inside a STRING SPAN on the
    // DEFAULT RHS and this break is in TYPE position. Only the lowered bytes
    // move — the `params:` position gained schema-subset.md:79's single-literal
    // emission under bug 0056 §Fix constraint 1
    // (docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md),
    // and the literal's own raw break survives into the `const` value, which is
    // what makes the recording assertion below and this one one claim.
    ["LIT (string literal in TYPE position)", ROW.LIT, { const: "a\nb" }],
    ["R1 (block-scalar type text)", ROW.R1, {}],
    ["R1b (folded block scalar — YAML folds the break to a space)", ROW.R1b, {}],
    [
      "R1c (block-scalar inline object type)",
      ROW.R1c,
      { $ref: "#/$defs/__inline_d84e83b5ca07d0e6" },
    ],
    [
      "R1d (union split across lines)",
      ROW.R1d,
      { anyOf: [{ $ref: "#/$defs/Triage" }, { type: "null" }] },
    ],
    ["R1e (generic split across lines)", ROW.R1e, { type: "array", items: { type: "integer" } }],
    ["R2 (multi-line flow mapping)", ROW.R2, { $ref: "#/$defs/__inline_d84e83b5ca07d0e6" }],
    [
      "R2b (nested multi-line flow mapping)",
      ROW.R2b,
      { $ref: "#/$defs/__inline_90133f3fc80f32bb" },
    ],
    ["F1 (the forged `Theta: /evil` line in TYPE text)", ROW.F1, {}],
    ["R3e (the forged `User arguments: ` line in TYPE text)", ROW.R3e, {}],
  ];

  for (const [label, paramsBlock, fragment] of ADMITTED) {
    it(`GREEN (d, ${label}): loads with no diagnostic and lowers unchanged`, () => {
      // `loadCleanly` asserts the empty diagnostic list first, which is the half
      // a text-level break refusal would break; the fragment assertion is the
      // half a recording-side rewrite would break.
      const loaded = loadCleanly(label, paramsBlock);
      expect(
        loaded.properties["p"],
        `${label}: §Fix constraint 1 — the refusal predicate is a line terminator inside a STRING SPAN, and this spelling has none`,
      ).toEqual(fragment);
    });
  }

  /**
   * The three forms that carry a quote without opening a string span. Each is
   * enumerated in the default RHS's own refused set
   * (frontmatter-fields-a.md:60 names `${...}` and `@`...``), so each draws the
   * sibling code from the same per-field loop; what must NOT co-fire is a code
   * whose registry *Trigger* asserts a literal newline inside a string literal
   * (code-registry-parse.md:13), because the source carries no string literal
   * at all. A break inside an `@`...`` query template is the spelling that same
   * row's *Hint* directs multi-line text to, and body code admits it (measured:
   * `let s = @`x "a<LF>b"`` draws no diagnostic).
   */
  const QUOTE_WITHOUT_SPAN: ReadonlyArray<readonly [string, string]> = [
    ["QRY (a break inside an `@`...`` query template)", ROW.QRY],
    ["TPL (a break inside a backtick template)", ROW.TPL],
    ["INTP (a break inside a bare `${...}` interpolation)", ROW.INTP],
  ];

  for (const [label, paramsBlock] of QUOTE_WITHOUT_SPAN) {
    it(`GREEN (d, ${label}): ${SIBLING_CODE} alone, with no ${CODE}`, () => {
      const doc = parseDoc(src(paramsBlock), "bug0102.theta");
      expect(
        diagCodes(doc),
        `${label}: §Fix constraint 1 — the refusal predicate is a line terminator inside a STRING SPAN, and a quote inside a template / query / \`\${...}\` block opens none. Emitting ${CODE} here would assert a string literal the source does not contain. Rendered: ${JSON.stringify(diagLines(doc))}`,
      ).toEqual([`error ${SIBLING_CODE}`]);
    });
  }

  it("GREEN (d, CTL denotation): the escape spelling still records and re-parses to the two-line value", () => {
    // The remedy the refusal leaves the author, pinned end to end: the recorded
    // bytes keep the two-character escape, and `parseExpressionSource` — the
    // reader the invocation-time default recovery uses — decodes them to the
    // value the author wrote. This is the assertion that makes the refusal
    // actionable rather than a dead end.
    const recorded = fieldOf(loadCleanly("CTL", ROW.CTL), "p").defaultSource;
    expect(
      recorded,
      "the default RHS after the first top-level `=`: a YAML single-quoted scalar passes the backslash through, so the theta escape survives",
    ).toBe('"a\\nb"');
    const reparsed = parseExpressionSource(recorded as string);
    expect(
      reparsed?.kind === "string" ? reparsed.value : reparsed,
      "lexical.md:26 — `\\n` is the escape table's newline, so the recovered value is the two-line string the source denotes",
    ).toBe("a\nb");
  });

  it("GREEN (d, LIT recording): the TYPE-position string literal keeps its raw break", () => {
    // The fence on constraint 6: the binder's string-literal escape arm stays
    // reachable through a `LiteralType` in type position, so the arm does not
    // become dead code and its four normative reference renderings need no
    // edit. A refusal keyed on the recorded TEXT rather than on the default RHS
    // would take this row with it.
    expect(
      fieldOf(loadCleanly("LIT", ROW.LIT), "p").type,
      "the recorded declared type is the block scalar's bytes, break included",
    ).toBe('"a\nb"');
  });

  it(`GREEN (d, X3): the sibling ${SIBLING_CODE} keeps its own subject`, () => {
    // The control that shows the loop's existing check is untouched, and the
    // measurement behind this file's "a refusal erases the recording" note: an
    // error-severity params diagnostic withholds the whole frontmatter, so a
    // refused fixture has no `params.fields` and no readable `defaultSource`.
    const doc = parseDoc(src(ROW.X3), "bug0102.theta");
    expect(
      diagCodes(doc),
      `X3: an operator is outside the literal sublanguage (frontmatter-fields-a.md:60). Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${SIBLING_CODE}`]);
    expect(
      doc.diagnostics[0]?.message,
      "DIAG-4 — the registry row's Message with `<expr>` rendered as the offending sub-expression",
    ).toBe(registryMessageOf(SIBLING_CODE).replace("<expr>", "1 + 1"));
    expect(
      doc.frontmatter,
      "X3: the frontmatter is withheld, so neither `params.fields` nor any recorded `defaultSource` survives a refusal",
    ).toBeNull();
    expect(
      doc.frontmatter?.params?.fields,
      "the recording is unreachable through a refused document, which is why group (f) supplies the recorded bytes directly",
    ).toBeUndefined();
  });
});

// ===========================================================================
// (e) THE SHARED-TOKENISER FENCE (§Fix constraint 2). GREEN at HEAD and
// required to stay green: `tokeniseExpr` is shared with `isBareObjectLiteral`,
// whose only `src/` caller is the `theta/parse/tool-arg-not-object-literal`
// guard, so a newline test placed in the scanner would change a second
// consumer's verdict to close a defect at this position.
// ===========================================================================

describe("bug 0102 (e) — `isBareObjectLiteral` keeps all four verdicts", () => {
  /** The four measured answers, the first of which is a legal Pi-tool argument. */
  const SHAPES: ReadonlyArray<readonly [string, string, boolean]> = [
    ["a multi-line bare object literal", '{ path: "a",\nmode: "b" }', true],
    ["a one-line bare object literal", '{ path: "a" }', true],
    ["a bare object whose field value carries a raw break", '{ path: "a\nb" }', true],
    ["a bare identifier", "args", false],
  ];

  for (const [label, source, expected] of SHAPES) {
    it(`GREEN (e, ${label}): ${expected}`, () => {
      expect(
        isBareObjectLiteral(source),
        `${label}: the tool-argument shape rule reads this predicate alone (src/runtime/tool-call.ts), so the refusal must be a scan at the \`parseParams\` call site and \`tokeniseExpr\` must stay byte-stable for every input; source ${JSON.stringify(source)}`,
      ).toBe(expected);
    });
  }
});

// ===========================================================================
// (f) WHY REFUSAL IS THE HONEST DISPOSITION — the recovery shapes. GREEN at
// HEAD and required to stay green: the readers keep their current behaviour
// (§Fix constraint 8), so a later narrowing of the refusal reds here by
// re-admitting an input whose recovered value is not the declared one.
// ===========================================================================

describe("bug 0102 (f) — the recovered default is not the value the source denotes", () => {
  /**
   * The `defaultSource` bytes each refused row records. Supplied directly
   * because the refusal withholds the frontmatter (group (d)'s X3 cell), so
   * these bytes are unreachable through a loaded document; they are the input
   * `#recoverDeclaredDefaults` hands `parseExpressionSource` at invocation
   * (src/extension/production-theta-producer.ts).
   */
  const RECORDED = {
    R3b: '"a\nb"',
    SQ: "'a\nb'",
    ARR: '["a\nb"]',
    OBJ: '{ text: "a\nb" }',
  } as const;

  /** The AST of one recorded default, or a loud failure. */
  function reparse(label: string, source: string): Expr {
    const parsed: Expr | null = parseExpressionSource(source);
    if (parsed === null) {
      throw new Error(`${label}: ${JSON.stringify(source)} parses to no expression at all`);
    }
    return parsed;
  }

  for (const [label, source] of [
    ["R3b/R3c (double-quoted)", RECORDED.R3b],
    ["SQ (single-quoted)", RECORDED.SQ],
  ] as const) {
    it(`GREEN (f, ${label}): the recovery truncates the value at the break`, () => {
      // The theta lexer ends a regular string at the raw break
      // (src/lexer/lexer.ts, the string scan's loop condition) and
      // `parseExpressionSource` discards the diagnostics that scan raises, so
      // the node the recovery evaluates is the truncated string. The binder
      // renders the same recorded bytes as `"a\nb"`, which
      // binder-bypass-and-envelope.md:142 states denotes the source's value —
      // two readers, two values, one input the grammar does not admit.
      const parsed = reparse(label, source);
      expect(parsed.kind, `${label}: the recovered node is a string literal`).toBe("string");
      expect(
        parsed.kind === "string" ? parsed.value : undefined,
        `${label}: the bound default is the one-character string, not the two-line value the source and the rendered prompt both denote`,
      ).toBe("a");
    });
  }

  it("GREEN (f, ARR): the recovery fabricates two array elements the author never wrote", () => {
    const parsed = reparse("ARR", RECORDED.ARR);
    expect(parsed.kind, "ARR: the recovered node is an array literal").toBe("array");
    const elements = parsed.kind === "array" ? parsed.elements : [];
    expect(
      elements.map((e) => e.kind),
      "ARR: the break truncates the first element and the remaining bytes re-parse as grammar — an unbound identifier and the closing bracket as a string literal, against a schema declaring `array<string>`",
    ).toEqual(["string", "ident", "string"]);
  });

  it("GREEN (f, OBJ): the recovery fabricates a field the lowered schema forbids", () => {
    const parsed = reparse("OBJ", RECORDED.OBJ);
    expect(parsed.kind, "OBJ: the recovered node is an object literal").toBe("object");
    const fields = parsed.kind === "object" ? parsed.fields : [];
    expect(
      fields.map((f) => f.name),
      "OBJ: `Note` declares `text` alone and lowers with `additionalProperties: false`, and the recovered object carries a second field named after the bytes past the break",
    ).toEqual(["text", "b"]);
  });
});
