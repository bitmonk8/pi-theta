import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { renderBinderParamLine } from "../src/binder/binder-system-prompt";
import { defaultLiteralStaticType } from "../src/parser/literal-sublanguage";
import { parseExpressionSource, type ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0239 — a `params:` default whose string literal never closes registers
// with zero diagnostics: `p: 'string = "abc'` lowers `{"type":"string"}` with
// `required: []` and records `defaultSource` as the unterminated `"abc`, where
// the byte-identical text in body code draws
// `theta/parse/unterminated-string` and the same text one character to the LEFT
// of the `=` (the type half) draws
// `theta/load/params-type-not-expression` since bug 0232 (0.188.0)
// (docs/bugs/0239-params-default-unterminated-literal-admitted.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/lexical.md:26 (§String literals) — "EOF inside an
//     unterminated string literal is `theta/parse/unterminated-string`", and
//     "**Single-line only**". A string literal must close; text carrying one
//     that never closes spells no `STRING`.
//   - docs/spec_topics/grammar.md:9 — the Theta literal sublanguage "is a
//     strict subset of the expression grammar admitted in one position: the RHS
//     of a `params:` default", and every literal it admits is a legal Theta
//     expression. A subset admits nothing the superset refuses.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:60 (§Defaults) — the
//     default form is `field: type = literal` with the RHS "parsed by the
//     **Theta literal sublanguage**".
//   - docs/spec_topics/diagnostics/code-registry-parse.md:14 — the
//     `theta/parse/unterminated-string` row (*Sev* `E`, *Message* `unterminated
//     string literal`), the registered row for exactly these bytes.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:13 — the neighbouring
//     `theta/parse/literal-newline-in-string` row, whose *Trigger* already
//     names the `params:` default right-hand side and whose *Phase* cell
//     already reads `lex, parse`: bug 0102's precedent for a lex-phase row
//     firing at this position, and the exact DIAG-2 obligation this fix repeats.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the
//     registry is closed; a *Trigger* change is a spec change) and :74 (DIAG-4
//     — the *Message* column is normative, which is why every expected message
//     below is read out of the registry rather than copied as prose).
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:80 — *Phase* "identifies
//     which pipeline stage emits the diagnostic"; :56 — the column
//     distinguishes `lex` / `parse` / `type` inside `theta/parse/*`.
//
// THE SETTLED ROUTE THIS FILE ENCODES (§Fix (a) route 2, "refuse at the default
// splitter's own position"; the run's decision, not re-litigated here):
//   1. A NEW default-side guard in `parseParams`'s per-field default loop
//      (`src/parser/params.ts`) tests the DEFAULT half with the existing
//      predicate `hasUnterminatedStringLiteral` — bug 0232's, unchanged, whose
//      single existing caller reads the TYPE half and is untouched.
//   2. The guard sits AFTER the `hasRawNewlineInStringLiteral` push and BEFORE
//      `checkLiteralSublanguage`, gated on "no error-severity diagnostic
//      emitted for this field yet" and continuing the loop — so exactly one
//      diagnostic per offending field, bug 0102's raw-newline verdicts stay
//      byte-identical, and bug 0163's compatibility pair
//      (`paramsDeclaredCompatType` / `defaultLiteralStaticType` feeding
//      `checkParamsDefaultCompat`) never runs on a type derived from bytes that
//      spell no literal.
//   3. The code raised is the registered row `theta/parse/unterminated-string`,
//      *Message* unchanged (DIAG-4). Its *Trigger* gains the `params:` default
//      reach sentence and its *Phase* cell gains `parse` beside `lex` in the
//      same commit (DIAG-2), mirrored in docs/reference/diagnostics.md — the
//      obligation bug 0102 discharged for its own row. Group (R) is that half.
//   4. Nothing else moves: no lexed position changes what it draws (group (b)),
//      no admitted default's lowered bytes change (rows a3, a10, d2), and the
//      two downstream readers keep their current behaviour (group (c)) — the
//      fix makes them UNREACHABLE for a refused input, it does not change them.
//
// MEASURED AT HEAD f5d0d125 (0.198.0), every §Reproduction value re-derived
// with zero drift before this file was written. Fixture: `mode: prompt` plus
// the single `params:` row, body `"hi"`.
//   a1  p: 'string = "abc'              []  {"type":"string"}   defaultSource "abc
//   a2  p: "string = 'abc"              []  {"type":"string"}   defaultSource 'abc
//   a3  p: 'string = "abc"'   (control) []  {"type":"string"}   defaultSource "abc"
//   a4  p: 'string = "abc def # x'      []  {"type":"string"}
//   a5  p: 'string = "abc\"'            []  {"type":"string"}
//   a6  p: 'integer = "abc'             ONE error params-default-type-mismatch
//   a7  p: 'boolean = "true'            ONE error params-default-type-mismatch
//   a8  p: 'string | null = "abc'       []  {"type":["string","null"]}
//   a9  p: '"x" | "y" = "z'             []  enum ["x","y"]
//   a10 p: '"x" | "y" = "z"'  (control) []  enum ["x","y"]      defaultSource "z"
//   a11 p: 'array<string> = ["a", "b'   []  array of string
//   a12 p: '{a: string} = {a: "x'       []  $ref #/$defs/__inline_968e40317188aebd
//   a13 p: '{a as "w: integer}'         ONE error params-type-not-expression
//   b1  let a = "abc      (no trailing newline)  ONE error unterminated-string
//   b2  let a = "abc      (trailing newline)     ONE error literal-newline-in-string
//   b3  let a = "abc"     (trailing newline)     []
//   b4  fn f(): string { "abc }                  ONE error literal-newline-in-string
//   c1  renderBinderParamLine(… default literal `"abc`) → `  p (string) default="abc`
//   c2  parseExpressionSource('"abc')   → {kind:"string", value:"abc"}, end column 5
//   c3  parseExpressionSource("'abc")   → {kind:"string", value:"abc"}
//   c4  parseExpressionSource('"abc"')  → {kind:"string", value:"abc"}, end column 6
//   d2  p: 'array<string> = ["a", "b"'  []  array of string  defaultSource ["a", "b"
//   d3  defaultLiteralStaticType('"abc') === defaultLiteralStaticType('"abc"')
//
// WHAT "NAMING THE FIELD" MEANS FOR THIS CODE. §Expected behaviour and §Fix (b)
// of the bug document both say each offending row draws "an error-severity
// diagnostic naming the field `p`". The settled route raises
// `theta/parse/unterminated-string`, whose registry *Message* is the bare
// `unterminated string literal` and carries no `<field>` placeholder, and
// DIAG-4 forbids rewording it. The field is therefore named by the diagnostic's
// RANGE, not by its message text — which is what the `(a, drop gate)` cell
// asserts (`hasRange`). The document's phrasing is a leftover from the
// route-1/`default-without-literal` wordings it also weighed; the route the run
// settled cannot satisfy it literally without violating DIAG-4.
//
// A REFUSAL ERASES THE RECORDING. An error-severity diagnostic raised from the
// frontmatter pass returns before the `ParsedFrontmatter` is built, so a
// refused fixture has `doc.frontmatter === null`, no `params.fields`, and no
// reachable `defaultSource` — measured on rows a6, a7 and a13 at HEAD, which
// are refused there already. Every refused row's expectation below is therefore
// the triple (diagnostics, lowered `null`, defaultSource `null`).
//
// WHAT IS RED HERE AND WHY:
//   - group (R): the registry row's *Phase* cell reads `lex` alone and its
//     *Trigger* carries no `params:` sentence;
//   - group (a): rows a1, a2, a4, a5, a8, a9, a11 and a12 load with ZERO
//     diagnostics, lower a schema and register; rows a6 and a7 draw bug 0163's
//     compatibility code computed over a repaired type instead of the malformed
//     literal.
// GREEN BY DESIGN and required to stay green: rows a3, a10 and a13; group (b)'s
// four lexed cells (no route touches a lexed position); group (c)'s four reader
// calls (§Fix — the readers are made unreachable for refused inputs, not
// changed); group (d)'s d2 (§Non-goals — an unmatched BRACKET whose quotes all
// close is bug 0232's normative row-E2 class and does not move) and d3.
//
// ROW d1's CORPUS CLAIM IS NOT RE-IMPLEMENTED HERE. "No committed source
// moves" is discharged corpus-wide by `tests/committed-fixture-parse-gate.test.ts`,
// which parses every committed `.theta` and `.thetalib` the repository ships
// (AGENTS.md §Test suites); a scratch census in this file would be a second,
// weaker copy of that gate.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts — the shipped front end behind the standard inert
// deps double) or one direct call of a shipped reader
// (`renderBinderParamLine`, `parseExpressionSource`,
// `defaultLiteralStaticType`). The defect is a character-closure question over
// a recorded string and the artefacts it corrupts are returned by value on the
// document, so an integration tier would re-derive the same values through
// discovery without witnessing anything further, and a live tier adds a model
// downstream of a load-time refusal. The registration consequence is reached by
// asserting the two properties the shipped drop gate reads — error severity and
// the `theta/parse/` namespace — beside the null frontmatter. The live pair
// (`tests/live/params-default-unterminated-literal--live-cell.test.ts`,
// `tests/live/acceptance/params-default-unterminated-literal-load-refusal-.test.ts`)
// covers the real discovery→registration decision this tier cannot reach.
//
// NO SILENT SKIPPING: no cell early-returns or conditionally skips. The registry
// lookup asserts each row's presence and each placeholder before a template is
// used, and every diagnostic cell asserts the WHOLE unfiltered ordered
// `doc.diagnostics` list, so a missing emission can never read as a pass.

// ===========================================================================
// The registered rows and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

/** The row this fix raises at the `params:` default position. */
const UNTERMINATED = "theta/parse/unterminated-string";
/** The lexer's other end-of-span arm — group (b)'s newline exits. */
const NEWLINE_IN_STRING = "theta/parse/literal-newline-in-string";
/** Bug 0163's compatibility row, which rows a6 and a7 must stop drawing. */
const TYPE_MISMATCH = "theta/parse/params-default-type-mismatch";
/** Bug 0232's type-half refusal, which row a13 must keep drawing. */
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
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

/** One structured registry row, or a loud failure naming the code. */
function registryRowOf(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `the parsed diagnostics registry holds no row for ${code} — DIAG-2 makes the registry closed, so the code this file asserts must already ship`,
    );
  }
  return row;
}

/**
 * A registry row's normative *Message* with its named placeholders filled
 * (DIAG-4). Definedness and placeholder presence are asserted first, so a
 * missing row or a reworded template reds by naming the registry rather than by
 * a bare `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeTypeOf("string");
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

/** One expected diagnostic rendered as `<severity> <code>: <message>`. */
function line(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  return `error ${code}: ${msg(code, fills)}`;
}

// ===========================================================================
// Fixtures — §Reproduction (a)/(d)'s rows, byte-identical.
// ===========================================================================

/** A `mode: prompt` theta whose sole `params:` entry is `row`. */
function src(row: string): string {
  return `---\nmode: prompt\nparams:\n  ${row}\n---\n"hi"\n`;
}

/** A `mode: prompt` theta with no `params:` block whose body is `body`. */
function bodySrc(body: string): string {
  return `---\nmode: prompt\n---\n${body}`;
}

const PATH = "bug0239.theta";

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** The three observables §Reproduction (a) tabulates, for one `params:` row. */
interface RowObservables {
  readonly diagnostics: readonly string[];
  readonly lowered: unknown;
  readonly defaultSource: unknown;
}

function observe(row: string): RowObservables {
  const doc = parseDoc(src(row), PATH);
  const params = doc.frontmatter?.params;
  return {
    diagnostics: diagLines(doc),
    // `null` for a refused row: the refusal withholds the whole frontmatter, so
    // neither artefact is reachable — the disposition measured at HEAD on the
    // rows already refused there (a6, a7, a13).
    lowered: params?.loweredSchema ?? null,
    defaultSource: params?.fields?.[0]?.defaultSource ?? null,
  };
}

/** `LOWERED(x)` of §Reproduction: the one-field lowering with `required: []`. */
function loweredOne(fragment: unknown, defs?: Record<string, unknown>): unknown {
  const base = {
    type: "object",
    properties: { p: fragment },
    required: [] as string[],
    additionalProperties: false,
  };
  return defs === undefined ? base : { ...base, $defs: defs };
}

/** The refused triple: one diagnostic, no lowering, no recorded default. */
function refused(diagnostic: string): RowObservables {
  return { diagnostics: [diagnostic], lowered: null, defaultSource: null };
}

interface Row {
  readonly id: string;
  readonly row: string;
  readonly expected: RowObservables;
}

/** The inline object `{a: string}` mints this `$defs` slug — unmoved by any route. */
const INLINE_SLUG = "__inline_968e40317188aebd";

/** The refusal every offending row must draw, message read from the registry. */
function unterminatedLine(): string {
  return line(UNTERMINATED);
}

const A_ROWS: readonly Row[] = [
  { id: "a1 double-quoted, unclosed", row: `p: 'string = "abc'`, expected: refused(unterminatedLine()) },
  { id: "a2 single-quoted, unclosed", row: `p: "string = 'abc"`, expected: refused(unterminatedLine()) },
  {
    // CONTROL — one closing quote apart from a1 and admitted, which is what
    // makes a1's admission a defect rather than a policy.
    id: "a3 control, closed literal",
    row: `p: 'string = "abc"'`,
    expected: {
      diagnostics: [],
      lowered: loweredOne({ type: "string" }),
      defaultSource: '"abc"',
    },
  },
  {
    id: "a4 unclosed span swallowing a comment marker",
    row: `p: 'string = "abc def # x'`,
    expected: refused(unterminatedLine()),
  },
  {
    // §Fix (c) reach: an escaped quote leaves the span open, so the closure
    // question is not "is there a second quote byte".
    id: "a5 escaped quote, span still open",
    row: `p: 'string = "abc\\"'`,
    expected: refused(unterminatedLine()),
  },
  {
    // §Fix (b): a6 and a7 draw the malformed-literal refusal INSTEAD of bug
    // 0163's compatibility code — one diagnostic per offending field, and no
    // declared type compared against a type derived from bytes that spell no
    // literal.
    id: "a6 declared integer",
    row: `p: 'integer = "abc'`,
    expected: refused(unterminatedLine()),
  },
  {
    id: "a7 declared boolean",
    row: `p: 'boolean = "true'`,
    expected: refused(unterminatedLine()),
  },
  {
    id: "a8 declared union with null",
    row: `p: 'string | null = "abc'`,
    expected: refused(unterminatedLine()),
  },
  {
    id: "a9 declared literal union",
    row: `p: '"x" | "y" = "z'`,
    expected: refused(unterminatedLine()),
  },
  {
    // CONTROL — §Non-goals: `"z"` against `"x" | "y"` is admitted today with
    // every quote closed, which is bug 0163's check's own disposition and is
    // measured here only to isolate the closure defect.
    id: "a10 control, closed out-of-set literal union",
    row: `p: '"x" | "y" = "z"'`,
    expected: {
      diagnostics: [],
      lowered: loweredOne({ type: "string", enum: ["x", "y"] }),
      defaultSource: '"z"',
    },
  },
  {
    id: "a11 unclosed inside an array literal",
    row: `p: 'array<string> = ["a", "b'`,
    expected: refused(unterminatedLine()),
  },
  {
    id: "a12 unclosed inside an object literal",
    row: `p: '{a: string} = {a: "x'`,
    expected: refused(unterminatedLine()),
  },
  {
    // CONTROL — §Non-goals: the same malformation one character to the LEFT of
    // the `=`. Bug 0232's type-half guard owns it and must keep owning it.
    id: "a13 control, the same bytes in the type half",
    row: `p: '{a as "w: integer}'`,
    expected: refused(line(PARAMS_NOT_EXPR, [["<param>", "p"]])),
  },
];

// ===========================================================================
// (R) THE REGISTRY ROW — DIAG-2 / DIAG-4.
// RED at HEAD: the *Phase* cell reads `lex` alone and the *Trigger* names no
// `params:` reach, so an emission from the frontmatter `params:` read is
// outside the row as it is written today.
// ===========================================================================

describe("bug 0239 (R) — the reused row names the new emitting stage and reach", () => {
  it(`RED (R): ${UNTERMINATED} reads severity E, a Phase naming lex and parse, and a params: Trigger`, () => {
    const row = registryRowOf(UNTERMINATED);
    expect(
      row.severity,
      "severity E — the shipped drop gate reads error severity alone, so a warning would leave the theta registered carrying a default its source does not spell",
    ).toBe("E");
    expect(
      row.phase.includes("lex"),
      `Phase must KEEP \`lex\`: the lexer's own end-of-span report stays this row's first emitter for body code (group (b) row b1). Observed cell: ${JSON.stringify(row.phase)}`,
    ).toBe(true);
    expect(
      row.phase.includes("parse"),
      `Phase must GAIN \`parse\`: the refusal is emitted from the frontmatter \`params:\` read, and the neighbouring row that already fires at this position reads \`lex, parse\` (docs/spec_topics/diagnostics/code-registry-parse.md:13). Observed cell: ${JSON.stringify(row.phase)}`,
    ).toBe(true);
    expect(
      row.trigger.includes("params:"),
      `DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md:72) — bringing a second position into a row's emission set is a Trigger change, and the sibling row discharged exactly this obligation when bug 0102 brought it to the same position. Observed Trigger: ${JSON.stringify(row.trigger)}`,
    ).toBe(true);
    expect(
      msg(UNTERMINATED),
      "DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74) — a *Message* reword is deferred to theta 2.0, so a second emitter must leave this column untouched",
    ).toBe("unterminated string literal");
  });
});

// ===========================================================================
// (a) §Reproduction (a) — the `params:` default half. THE CLAIM.
// ===========================================================================

describe("bug 0239 (a) — a default RHS whose string literal never closes is refused", () => {
  for (const { id, row, expected } of A_ROWS) {
    it(`(a, ${id}): the whole diagnostic list, the lowering, and the recorded default`, () => {
      expect(
        observe(row),
        `${id} :: ${row} — docs/spec_topics/lexical.md:26 requires a string literal to close and ` +
          `docs/spec_topics/grammar.md:9 routes this position's RHS through a strict subset of the ` +
          `same expression grammar, so bytes carrying an unterminated span spell no literal here ` +
          `either. A cell showing \`[]\` plus a lowered schema IS bug 0239; a cell showing ` +
          `${TYPE_MISMATCH} is the misdirected report of §Reproduction rows a6/a7; a red on a3, ` +
          `a10 or a13 is an over-reach the settled route forbids`,
      ).toEqual(expected);
    });
  }

  it("(a, drop gate): every refused row's diagnostic is error-severity in a namespace the drop gate reads", () => {
    // WHY these two properties and not registration itself: the shipped drop
    // gate refuses a document exactly when some diagnostic has
    // `severity === "error"` and a code in the `theta/load/` or `theta/parse/`
    // namespace. Asserting both, beside the null frontmatter each row's cell
    // above pins, is this tier's reachability link from the diagnostic to a
    // theta that does not register; the live pair drives the real decision.
    const refusedRows = A_ROWS.filter((r) => r.expected.lowered === null);
    expect(
      refusedRows.length,
      "the refused set must not shrink silently: ten offending rows plus the type-half control a13",
    ).toBe(11);
    const observed = refusedRows.map(({ id, row }) => {
      const doc = parseDoc(src(row), PATH);
      return {
        id,
        shapes: doc.diagnostics.map((d) => ({
          severity: d.severity,
          dropGateNamespace:
            d.code.startsWith("theta/parse/") || d.code.startsWith("theta/load/"),
          hasRange: d.range !== undefined,
        })),
      };
    });
    expect(
      observed,
      "each refused row carries exactly one error-severity diagnostic in a drop-gate namespace, ranged on the offending field",
    ).toEqual(
      refusedRows.map(({ id }) => ({
        id,
        shapes: [{ severity: "error", dropGateNamespace: true, hasRange: true }],
      })),
    );
  });
});

// ===========================================================================
// (b) §Reproduction (b) — the same bytes in body code. GREEN at HEAD and
// required to stay green: the settled route is confined to the `params:`
// default position and changes what no lexed position draws.
// ===========================================================================

describe("bug 0239 (b) — the lexed positions are unchanged", () => {
  const B_ROWS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
    // b1 is the exit the fix reuses: EOF inside an open span.
    ["b1 `let a = \"abc` with no trailing newline", 'let a = "abc', [line(UNTERMINATED)]],
    ["b2 `let a = \"abc` with a trailing newline", 'let a = "abc\n', [line(NEWLINE_IN_STRING)]],
    ["b3 control, closed literal", 'let a = "abc"\n', []],
    ["b4 unclosed span inside an fn body", 'fn f(): string { "abc }\n', [line(NEWLINE_IN_STRING)]],
  ];

  for (const [id, body, expected] of B_ROWS) {
    it(`GREEN (b, ${id}): unchanged`, () => {
      expect(
        diagLines(parseDoc(bodySrc(body), PATH)),
        `${id}: §Fix — no route changes what any lexed position draws. The lexer's string scan ` +
          `reports at both exits, and this file's claim is the ONE position that reaches no lexer`,
      ).toEqual(expected);
    });
  }
});

// ===========================================================================
// (c) §Reproduction (c) — the two downstream readers of the recorded bytes.
// GREEN at HEAD and required to stay green: the fix makes them UNREACHABLE for
// a refused input (§Expected behaviour — "No consumer sees the malformed
// bytes"), it does not change what either does when called. A red here means a
// route reached into a reader instead of refusing at the declaration.
// ===========================================================================

describe("bug 0239 (c) — the readers keep their shipped behaviour and are not reached", () => {
  it("GREEN (c1): the binder system-prompt line renders the recorded bytes verbatim", () => {
    // What the binder model is shown today for row a1. Unreachable once the
    // declaration is refused, because no document carrying that field registers.
    expect(
      renderBinderParamLine({
        wireName: "p",
        type: "string",
        requirement: { kind: "default", literal: '"abc' },
      }),
      "c1: `renderBinderParamLine` (src/binder/binder-system-prompt.ts) interpolates the recorded literal after `default=` with only line breaks normalised",
    ).toBe('  p (string) default="abc');
  });

  const C_PARSES: ReadonlyArray<readonly [string, string, number]> = [
    // c2/c3: the bytes `#recoverDeclaredDefaults` hands `parseExpressionSource`
    // at invocation. The lexer raises this file's own code for them and that
    // entry point's lex deps discard it, so the malformed literal is repaired.
    ["c2 double-quoted, unclosed", '"abc', 5],
    ["c3 single-quoted, unclosed", "'abc", 5],
    // c4: the well-formed control. Same kind and same value as c2 — the repair
    // is total, which is why refusal at the declaration is the only channel
    // left to report it.
    ["c4 control, closed literal", '"abc"', 6],
  ];

  for (const [id, source, endColumn] of C_PARSES) {
    it(`GREEN (c, ${id}): parses to the string value \`abc\` with the lex diagnostic discarded`, () => {
      const parsed = parseExpressionSource(source);
      if (parsed === null) {
        throw new Error(`${id}: ${JSON.stringify(source)} parses to no expression at all`);
      }
      expect(
        {
          kind: parsed.kind,
          value: parsed.kind === "string" ? parsed.value : undefined,
          endColumn: parsed.range.end.column,
        },
        `${id}: the recovered value is identical for the unclosed and the closed spelling; ` +
          `only the range's end column differs, so no consumer of the value can tell them apart. ` +
          `§Non-goals keeps this entry point's discarded diagnostics out of scope, so this cell is ` +
          `unchanged law`,
      ).toEqual({ kind: "string", value: "abc", endColumn });
    });
  }
});

// ===========================================================================
// (d) §Reproduction (d) — bounds.
// d1's corpus claim is discharged corpus-wide by
// tests/committed-fixture-parse-gate.test.ts and is deliberately not
// re-implemented here.
// GREEN at HEAD and required to stay green.
// ===========================================================================

describe("bug 0239 (d) — the bounds the settled route does not cross", () => {
  it("GREEN (d2): an unmatched BRACKET whose quotes all close stays admitted", () => {
    // §Non-goals: every quote closes here; the construct is a container literal
    // the source does not close, which is bug 0232's normative boundary class
    // (its witness row E2 — an unclosed BRACE with no unterminated literal —
    // stays admitted). A red here means the new guard tests bracket balance
    // rather than string closure.
    expect(
      observe(`p: 'array<string> = ["a", "b"'`),
      "d2: the refusal predicate is an unterminated STRING LITERAL, not an unbalanced container",
    ).toEqual({
      diagnostics: [],
      lowered: loweredOne({ type: "array", items: { type: "string" } }),
      defaultSource: '["a", "b"',
    });
  });

  it("GREEN (d3): the compat reader still types both spellings identically", () => {
    // The reason the refusal must precede the compatibility judgement: this
    // reader cannot distinguish the malformed bytes from the well-formed ones,
    // so leaving it to answer is what produced rows a6/a7's misdirected report.
    // §Non-goals leaves the reader itself alone, so this cell is unchanged law.
    const open = defaultLiteralStaticType('"abc');
    expect(
      open,
      "d3: `defaultLiteralStaticType` (src/parser/literal-sublanguage.ts) types the unterminated span as a string literal",
    ).toEqual({ kind: "literal", typesAs: "string" });
    expect(
      open,
      "d3: identical to the closed control — the two are indistinguishable to this reader, which is why the closure question must be asked before it runs",
    ).toEqual(defaultLiteralStaticType('"abc"'));
  });
});

// ===========================================================================
// (I) THE INVENTORY ITSELF — anti-vacuity. A cell weakened to `[]` to buy green
// moves one of these counts.
// ===========================================================================

describe("bug 0239 (I) — the inventory is counted", () => {
  it("CONTROL: 13 (a) rows, ten of which expect the new refusal, all keys distinct", () => {
    expect(A_ROWS.length, "§Reproduction (a) tabulates thirteen rows").toBe(13);
    expect(
      A_ROWS.filter((r) => r.expected.diagnostics[0] === unterminatedLine()).length,
      "the ten rows §Fix (b) binds to the new refusal: a1, a2, a4, a5, a6, a7, a8, a9, a11, a12",
    ).toBe(10);
    expect(
      A_ROWS.filter((r) => r.expected.diagnostics.length === 0).length,
      "the two admitted controls a3 and a10",
    ).toBe(2);
    expect(
      new Set(A_ROWS.map((r) => r.id)).size,
      "every row id is distinct, so no cell is silently shadowed",
    ).toBe(A_ROWS.length);
  });
});
