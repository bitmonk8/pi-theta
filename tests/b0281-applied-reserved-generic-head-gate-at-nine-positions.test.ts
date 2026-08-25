import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0281 — an APPLIED `Ok<…>` / `Err<…>` spelling derives from no `Type`
// production at any arity, yet it is admitted at every type-reference position
// and lowers to the empty type there, so the annotation the author wrote
// constrains nothing
// (docs/bugs/0281-applied-ok-err-generic-application-silent-at-every-capture.md).
//
// THE SEAM. An applied spelling carries an argument list, so it is consumed
// structurally rather than as an atom: `TypeParser.parsePrimary`
// (`src/parser/type-grammar.ts`) tests the closed constructor set
// (`GENERIC_ARITY`, same file, frozen at `array` arity 1 and `Result` arity 2)
// and, when that declines, still reads any identifier followed by `<` as an
// application through `parseGeneric`, which records the head verbatim. The only
// judgement a generic node then receives is `walkType`'s arity check, a
// `GENERIC_ARITY` table lookup guarded by a definedness test, so a head the
// table does not hold is walked, its arguments are checked, and the head itself
// is discarded. The lowering repeats the omission: `lowerTypeExpr`
// (`src/parser/params.ts`) splits the text at its first `<`, special-cases
// `array`, and lowers every other head permissively to the empty type. The atom
// arm below it — the reserved-keyword classification whose sink bug 0277's fix
// rendered at all nine positions, and the `NamedType ::= Ident` resolution
// whose failure sink bug 0262's fix rendered at ten reference positions — runs
// only when the generic-application arm declines, which an applied spelling
// never makes it do.
//
// THE ADJUDICATED ROUTE THIS FILE ENCODES: bug 0281 §Fix route (a), taken in
// its NARROW variant — a RESERVED-HEAD GATE. The head is judged at
// `lowerTypeExpr`'s generic-application arm (`src/parser/params.ts`) when it is
// "a reserved spelling that is not a constructor keyword", and only then; one
// judgement covers every one of the nine type-reference positions and the
// nested interior positions alike, because all nine run their type-side checks
// through `parseTypeExpression` (`src/parser/type-grammar.ts`) and their
// lowering through `lowerTypeExpr`. Bug 0281 §Fix's own scope decision places
// this gate inside that report's authority and the wider "head not in
// `GENERIC_ARITY`" gate outside it, so an applied head that is no reserved
// spelling stays where it stands — group (D) below measures that standing.
//
// THE CODE THE REFUSAL ANSWERS TO, chosen so an applied spelling converges on
// the row its own BARE spelling already draws — the one-reading-one-spelling
// conclusion bugs 0262 and 0277 landed: a reserved spelling that is not a
// constructor keyword (`reservedKeywords`, `src/lexer/lexer.ts`, 32 spellings
// including `Ok`, `Err` and the primitive names) draws
// `theta/parse/reserved-keyword-as-identifier` — the sink bug 0277's fix wired
// at all nine positions. It is the only code this route emits, and
// `theta/parse/unresolved-named-type` appears below only as the row a BARE
// name already draws under bug 0262's landed widening.
//
// The not-expression family is not the code: it has no wired emitter at the
// `@<T>` capture's `E` argument or at the `invoke<Type>` ascription (group (C)
// records the measurement bug 0282 §Reproduction states and bug 0281 carries as
// a dated correction), so choosing it would owe an emission-set widening at two
// positions. No code is minted at version 0.277.0 and no *Message* byte moves:
// the row is pre-existing and `theta/parse/reserved-keyword-as-identifier`
// enumerates no position in its *Trigger* — "Reserved keyword used in an
// identifier position." (docs/spec_topics/diagnostics/code-registry-parse.md
// line 21) — which already covers a constructor-head position, since a head is
// read where an `Ident` is read (`NamedType ::= Ident`, grammar.md line 98). An
// error-severity `theta/parse/*` diagnostic denies registration — the GOV-15
// loads-cleanly reading
// (docs/spec_topics/governance/source-language-stability.md line 9).
//
// WHAT THE ROUTE MOVES. Groups (M), (I) and (A) assert a refusal where HEAD
// produces an EMPTY diagnostic list. Groups (C) and (D) are measured and green
// before and after: the closed set keeps its own readings, including the arity
// row a wrong-arity `Result` draws and the two positions where that row is
// silent, and an unknown applied head keeps the permissive lowering it has.
//
// THE GATE ORDER IS A PINNED CONTROL, group (C). For a head the closed set
// HOLDS, nothing changes: `Result<integer, string>` and `Result<integer, E>`
// stay legal where the grammar admits them, `Result<integer>` keeps drawing
// `theta/parse/generic-arity-mismatch` and never the new refusal, and
// `array<T>` stays legal at all nine positions. A gate that ran ahead of the
// arity check, or that read membership as a property of the spelling rather
// than of the head, reds there rather than in the committed-fixture gate.
//
// THE INERT HALF, group (I). Because the applied head lowers to the empty type,
// the annotation constrains nothing: `let a: Ok<integer> = "not-an-integer"`
// loads where `let a: integer = "s"` draws
// `theta/parse/let-rhs-type-mismatch`. The head gate refuses the document at
// the head itself and leaves the lowering untouched, so each row is asserted as
// ONE line and not two — the shape the bare spelling of the same head already
// measures at that position.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (tests/helpers/e2e-s1.ts — the shipped whole-file entry point wrapped in
// inert deps, no behaviour stubbed). An integration tier would add a round trip
// to a value already fixed at the parse boundary and observe nothing sharper; a
// live tier cannot see a parse-time diagnostic LIST at all, only the
// registration outcome it implies. Registration is asserted here through the
// composition root's own predicate rather than a live load.
//
// NO SILENT SKIPPING. Nothing here early-returns, branches on the environment
// or skips. `msg` asserts its registry row is present and carries each
// placeholder it fills before substituting, and every cell asserts its fixture
// captured a body statement and exactly the declarations it names BEFORE
// reading a disposition off it — a fixture the parser dropped upstream produces
// an empty diagnostic list, which is indistinguishable from a clean load unless
// the capture is asserted separately.
//
// ANTI-VACUITY. Every cell asserts an ORDERED WHOLE-LIST equality over the
// UNFILTERED `doc.diagnostics` — never containment — so neither an extra
// diagnostic nor one at the wrong position can hide. `Nope`, `Ghost` and
// `SomeError` are declared and imported nowhere.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PATH}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/** The row an applied RESERVED head draws under the adjudicated routing. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
/** The row an applied non-reserved identifier head draws under the same routing. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
/** The closed set's own arity row, which the head gate must not displace. */
const ARITY = "theta/parse/generic-arity-mismatch";
/** `Result`'s own row at the three lowered-schema positions. */
const RESULT_SCHEMA = "theta/parse/result-in-schema-position";
/** What the `Ok` / `Err` alias cells draw, at the declaration and not the type. */
const EMPTY_SCHEMA = "theta/parse/empty-schema-body";
/** The alias cells' second and third lines, on the angle list left in statement position. */
const UNSUPPORTED = "theta/parse/unsupported-feature";
/** The check group (I) shows an applied `let` annotation currently disables. */
const LET_MISMATCH = "theta/parse/let-rhs-type-mismatch";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a row whose *Message* moved reds by naming the registry page rather than by a
 * bare `undefined` comparison downstream. No message prose is written out in
 * this file.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${REGISTRY_PATH} must carry the Message row for ${code}`,
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

/** One rendered diagnostic line, `<severity> <code>: <message>` — the bug document's own rendering. */
function line(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  return `error ${code}: ${msg(code, fills)}`;
}

/** The keyword refusal, rendered for the spelling `keyword`. */
function reservedLine(keyword: string): string {
  return line(RESERVED, [["<keyword>", keyword]]);
}

/** The name refusal, rendered for the head `name`. */
function unresolvedLine(name: string): string {
  return line(UNRESOLVED, [["<name>", name]]);
}

/** The arity refusal, rendered for one constructor, its declared arity and the written count. */
function arityLine(ctor: string, expected: number, actual: number): string {
  return line(ARITY, [
    ["<ctor>", ctor],
    ["<expected>", String(expected)],
    ["<actual>", String(actual)],
  ]);
}

// ===========================================================================
// The load harness.
// ===========================================================================

/** One parsed row: its codes, its rendered lines, and the declarations it captured. */
interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}

/** The frontmatter every body fixture carries; its length puts the body at line 6. */
const FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

/** A parsed document wrapped as a row, so every group reads one shape. */
function row(label: string, source: string): LoadRow {
  const doc = parseDoc(source, "b0281.theta");
  return {
    label,
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    lines: doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
    declared: doc.body.statements
      .filter((s) => s.kind === "schema" || s.kind === "enum")
      .map((s) => (s as { name: string }).name),
    statements: doc.body.statements.length,
    doc,
  };
}

/** A `mode: prompt` theta whose body is `body` verbatim, parsed once. */
function theta(label: string, body: string): LoadRow {
  return row(label, `${FRONTMATTER}${body}\n`);
}

/**
 * A `mode: prompt` theta whose `params:` frontmatter declares one field of the
 * given type — the position that builds its diagnostic itself rather than
 * through the shared builder. The type text sits on frontmatter line 5. The
 * body carries a binding rather than a bare string so the shared capture
 * precondition has a statement to read.
 */
function paramsTheta(label: string, typeText: string): LoadRow {
  return row(
    label,
    `---\ndescription: d\nmode: prompt\nparams:\n  p: '${typeText}'\n---\n\nlet z = 1\n"ok"\n`,
  );
}

/**
 * The composition root's registration gate, mirrored: `hasLoadParseError`
 * (`src/extension/production-composition.ts`) is
 * `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
 * d.code.startsWith("theta/parse/")))`, and a document carrying one is not
 * registered. Every diagnostic below is a `theta/parse/…` code, so the
 * code-prefix half of the real predicate always holds here.
 */
function registered(r: LoadRow): boolean {
  return !r.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

/**
 * The 1-indexed `line:column` start of each diagnostic in a row. The positions
 * this bug separates emit at different columns of one source line — the `let`,
 * `fn` and `schema` sites at the declaration's own start, the `invoke<Type>`
 * and query sites at their expression's start — so the column is what reads
 * WHICH position spoke.
 */
function startPositions(r: LoadRow): string[] {
  return r.doc.diagnostics.map((d: Diagnostic) =>
    d.range === undefined ? "unlocated" : `${d.range.start.line}:${d.range.start.column}`,
  );
}

/**
 * Assert every row parsed to a body and captured exactly the declarations it
 * names, before any disposition is read off it. A dropped statement produces an
 * empty diagnostic list, which reads exactly like a clean load unless the
 * capture is asserted separately — this is the precondition, failing loudly.
 */
function expectCaptured(rows: readonly LoadRow[], names: readonly string[]): void {
  const empty = rows.filter((r) => r.statements === 0).map((r) => r.label);
  expect(
    empty,
    "precondition: every fixture must parse to at least one body statement; a row listed here lost its body upstream of the type walk, so its diagnostic list says nothing about this bug",
  ).toEqual([]);
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}`,
  ).toEqual([]);
}

/**
 * Assert the ordered code list, THEN the ordered rendered-message list. The
 * message side is a thunk so the registry read happens only after the code
 * assertion has passed: a missing emission must red as a missing diagnostic,
 * not as a registry lookup.
 */
function expectRows(
  rows: readonly LoadRow[],
  expected: readonly (readonly string[])[],
  expectedLines: () => readonly (readonly string[])[],
): void {
  expect(rows.map((r) => [r.label, r.codes])).toEqual(rows.map((r, i) => [r.label, expected[i]]));
  const wanted = expectedLines();
  expect(rows.map((r) => [r.label, r.lines])).toEqual(rows.map((r, i) => [r.label, wanted[i]]));
}

// ===========================================================================
// The nine type-reference positions.
// ===========================================================================

/** One probed position: its fixture, the declarations it captures, and its emission range. */
interface Position {
  readonly id: string;
  /** The fixture, in the shape bug 0281 §Reproduction spells it. */
  readonly build: (spelling: string) => LoadRow;
  /** The declarations the fixture captures, asserted before any disposition. */
  readonly decls: readonly string[];
  /**
   * The `line:column` this position emits at. Each is MEASURED, at this
   * position, over the same fixture shape carrying the BARE spelling of the
   * head under test — the reading an applied head converges on. The range is
   * therefore fixed by the position's existing sibling emission rather than
   * chosen here.
   */
  readonly at: string;
}

const POSITIONS: readonly Position[] = [
  {
    id: "query-T-head",
    build: (sp) => theta(`query-T-head (${sp})`, `let r = @<${sp}>\`q\`\n"ok"`),
    decls: [],
    at: "6:9",
  },
  {
    id: "query-E-arg",
    build: (sp) => theta(`query-E-arg (${sp})`, `let r = @<Result<integer, ${sp}>>\`q\`\n"ok"`),
    decls: [],
    at: "6:9",
  },
  {
    id: "fn-return",
    build: (sp) => theta(`fn-return (${sp})`, `fn step(): ${sp} { Ok(1) }\n"ok"`),
    decls: [],
    at: "6:1",
  },
  {
    id: "fn-param",
    build: (sp) => theta(`fn-param (${sp})`, `fn step(p: ${sp}): integer { 1 }\n"ok"`),
    decls: [],
    at: "6:1",
  },
  {
    id: "let-annot",
    build: (sp) => theta(`let-annot (${sp})`, `let a: ${sp} = Ok(1)\n"ok"`),
    decls: [],
    at: "6:1",
  },
  {
    id: "invoke-ascr",
    build: (sp) => theta(`invoke-ascr (${sp})`, `let r = invoke<${sp}>("./x.theta", "hi")\n"ok"`),
    decls: [],
    at: "6:9",
  },
  {
    id: "schema-field",
    build: (sp) => theta(`schema-field (${sp})`, `schema S { f: ${sp} }\n"ok"`),
    decls: ["S"],
    at: "6:1",
  },
  {
    id: "schema-alias",
    build: (sp) => theta(`schema-alias (${sp})`, `schema S = ${sp}\n"ok"`),
    decls: ["S"],
    at: "6:1",
  },
  {
    id: "params-field",
    build: (sp) => paramsTheta(`params-field (${sp})`, sp),
    decls: [],
    at: "5:6",
  },
];

/** Every (position, spelling) pair, in table order, with its position's own facts. */
function cells(spellings: readonly string[]): {
  position: Position;
  spelling: string;
  head: string;
  row: LoadRow;
}[] {
  return POSITIONS.flatMap((position) =>
    spellings.map((spelling) => ({
      position,
      spelling,
      head: spelling.slice(0, spelling.indexOf("<")),
      row: position.build(spelling),
    })),
  );
}

/** Assert one whole matrix's captures, ordered codes, ordered lines and registration. */
function expectMatrix<T extends { position: Position; row: LoadRow }>(
  probes: readonly T[],
  codesFor: (p: T) => readonly string[],
  linesFor: (p: T) => readonly string[],
  registers: (p: T) => boolean,
): void {
  for (const position of POSITIONS) {
    expectCaptured(
      probes.filter((p) => p.position === position).map((p) => p.row),
      position.decls,
    );
  }
  expectRows(
    probes.map((p) => p.row),
    probes.map(codesFor),
    () => probes.map(linesFor),
  );
  expect(
    probes.map((p) => [p.row.label, registered(p.row)]),
    "registration follows the diagnostic list: an error-severity parse refusal denies it",
  ).toEqual(probes.map((p) => [p.row.label, registers(p)]));
}

/**
 * The three lines the `schema X = Ok<…>` / `Err<…>` cells draw at the alias
 * position, and their ranges. The reserved head breaks the DECLARATION parse
 * before any type-side pass runs, so the alias captures no arm and the angle
 * list is left standing in statement position; the head gate never reaches
 * this cell and its bytes are pinned as MEASURED, unchanged before and after.
 */
const ALIAS_PREFIX = "schema S = ";
function aliasCodes(): readonly string[] {
  return [EMPTY_SCHEMA, UNSUPPORTED, UNSUPPORTED];
}
function aliasLines(): readonly string[] {
  return [
    line(EMPTY_SCHEMA, [["<X>", "S"]]),
    line(UNSUPPORTED, [["<construct>", "stray '<' in statement position"]]),
    line(UNSUPPORTED, [["<construct>", "stray '>' in statement position"]]),
  ];
}
function aliasPositions(spelling: string): readonly string[] {
  const head = spelling.slice(0, spelling.indexOf("<"));
  return [
    "6:1",
    `6:${ALIAS_PREFIX.length + head.length + 1}`,
    `6:${ALIAS_PREFIX.length + spelling.length}`,
  ];
}

// ===========================================================================
// (M) The subject — the 9 × 2 matrix of an applied `Ok<…>` / `Err<…>`.
// ===========================================================================

const RESERVED_SPELLINGS = ["Ok<integer>", "Err<string>"] as const;

describe("b0281 (M) — an applied `Ok<…>` / `Err<…>` is refused at all nine type-reference positions", () => {
  it("b0281-M: each position draws the keyword refusal, except the alias cells that refuse the declaration", () => {
    // The heart of the report, and the largest red group: at HEAD sixteen of
    // these eighteen diagnostic lists are EMPTY and their documents register,
    // because the head is read as an arbitrary constructor name at both seams
    // and judged by neither. The head text travels in the *Message*, so no cell
    // can satisfy another's assertion. The two alias cells are measured green
    // and pinned byte-for-byte: they refuse the declaration and say nothing
    // about the type, because a reserved head breaks the declaration parse
    // before any type-side pass runs.
    const probes = cells([...RESERVED_SPELLINGS]);
    expectMatrix(
      probes,
      (p) => (p.position.id === "schema-alias" ? aliasCodes() : [RESERVED]),
      (p) => (p.position.id === "schema-alias" ? aliasLines() : [reservedLine(p.head)]),
      () => false,
    );
  });

  it("b0281-M-position: each refusal sits at the range that position already uses for the bare spelling", () => {
    // The range is fixed by measurement, not chosen: the BARE `Ok` / `Err`
    // already draws this row at these positions, at the declaration's own start
    // for the `let`, `fn` and `schema` sites, at the expression's start for the
    // `invoke<Type>` and query sites, and at the `params:` field's own text.
    // This cell reds on a route that emitted the right code from the wrong
    // position, which the columns separate on one source line.
    const probes = cells([...RESERVED_SPELLINGS]);
    expect(
      probes.map((p) => [p.row.label, startPositions(p.row)]),
      "an applied head refuses at the same range its position already uses for the bare spelling",
    ).toEqual(
      probes.map((p) => [
        p.row.label,
        p.position.id === "schema-alias" ? aliasPositions(p.spelling) : [p.position.at],
      ]),
    );
  });

  it("b0281-M-arity-free: an applied `Ok<…>` at a count no constructor declares is refused once", () => {
    // `Ok` is in no arity table at any count, so the head gate is the whole
    // verdict and no arity line joins it: bug 0281 §Reproduction control 3
    // measures `let a: Ok<integer, string, boolean> = 3` silent at HEAD, and
    // the route refuses it exactly as it refuses the arity-1 spelling. A route
    // that reached this input through the arity check instead of the membership
    // test reds here with a different code.
    const r = theta("M-arity — `let a: Ok<integer, string, boolean> = 3`", 'let a: Ok<integer, string, boolean> = 3\n"ok"');
    expectCaptured([r], []);
    expectRows([r], [[RESERVED]], () => [[reservedLine("Ok")]]);
    expect([[r.label, startPositions(r)]], "the `let` position speaks at the statement's own start").toEqual([
      [r.label, ["6:1"]],
    ]);
    expect([[r.label, registered(r)]], "a refused document is not registered").toEqual([[r.label, false]]);
  });
});

// ===========================================================================
// (I) The inert half — the annotation the author wrote is kept.
// ===========================================================================

describe("b0281 (I) — an annotation spelled as an applied `Ok<…>` / `Err<…>` no longer loads", () => {
  it("b0281-I: the seven inert rows draw the keyword refusal and do not register", () => {
    // RED at HEAD, where each of these seven loads with an EMPTY list and
    // registers: the applied head lowers to the empty type, so the position's
    // own check runs against a type that admits everything and
    // `let a: Ok<integer> = "not-an-integer"` is accepted where the annotated
    // control below is not. Each row is asserted as ONE line, which is what the
    // BARE spelling of the same head measures at the same position today —
    // `let a: Ok = "not-an-integer"`, `let a: Ok | null = 3` and
    // `@<Result<integer, Err>>` each draw exactly one refusal.
    const rows = [
      theta("I1 — `let a: Ok<integer> = \"not-an-integer\"`", 'let a: Ok<integer> = "not-an-integer"\n"ok"'),
      theta("I2 — `let a: Ok<integer> = 3`", 'let a: Ok<integer> = 3\n"ok"'),
      theta("I3 — `let a: Err<string> = 3`", 'let a: Err<string> = 3\n"ok"'),
      theta("I4 — `let a: Ok<integer, string, boolean> = 3`", 'let a: Ok<integer, string, boolean> = 3\n"ok"'),
      theta("I5 — `fn f(): Ok<integer> { \"s\" }`", 'fn f(): Ok<integer> { "s" }\n"ok"'),
      theta("I6 — `let a: Ok<integer> | null = 3`", 'let a: Ok<integer> | null = 3\n"ok"'),
      theta("I7 — `@<Result<integer, Err<string>>>`", 'let r = @<Result<integer, Err<string>>>`q`\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [RESERVED]),
      () => [
        [reservedLine("Ok")],
        [reservedLine("Ok")],
        [reservedLine("Err")],
        [reservedLine("Ok")],
        [reservedLine("Ok")],
        [reservedLine("Ok")],
        [reservedLine("Err")],
      ],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the six annotation rows speak at their statement's own start and the query row at its expression",
    ).toEqual([
      ["I1 — `let a: Ok<integer> = \"not-an-integer\"`", ["6:1"]],
      ["I2 — `let a: Ok<integer> = 3`", ["6:1"]],
      ["I3 — `let a: Err<string> = 3`", ["6:1"]],
      ["I4 — `let a: Ok<integer, string, boolean> = 3`", ["6:1"]],
      ["I5 — `fn f(): Ok<integer> { \"s\" }`", ["6:1"]],
      ["I6 — `let a: Ok<integer> | null = 3`", ["6:1"]],
      ["I7 — `@<Result<integer, Err<string>>>`", ["6:9"]],
    ]);
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "none of the seven registers once its annotation is refused",
    ).toEqual(rows.map((r) => [r.label, false]));
  });

  it("b0281-I-control: an annotation the grammar derives keeps driving its own check", () => {
    // GREEN at HEAD and the contrast that makes group (I) legible: the same
    // `let` position, annotated with a `PrimitiveType`, reports the initialiser
    // mismatch the applied heads above silently suppress. This row's code is a
    // `type`-phase row and must not move under a head gate.
    const control = theta("I-control — `let a: integer = \"s\"`", 'let a: integer = "s"\n"ok"');
    expectCaptured([control], []);
    expectRows(
      [control],
      [[LET_MISMATCH]],
      () => [
        [
          line(LET_MISMATCH, [
            ["<name>", "a"],
            ["<expected>", "integer"],
            ["<actual>", "string"],
          ]),
        ],
      ],
    );
    expect(
      [[control.label, registered(control)]],
      "the mismatch is error-severity, so the control does not register either",
    ).toEqual([[control.label, false]]);
  });
});

// ===========================================================================
// (D) The class the narrow route leaves standing — bug 0282's open subject.
// ===========================================================================

const UNKNOWN_SPELLINGS = ["Nope<integer>", "Ghost<string>"] as const;

// FLIPPED under bug 0282 0.280.0's flip authority (§Fix "Flip authority" clause,
// group (D)): this class was measured as a control while bug 0282 stayed open
// — an applied head that is no reserved spelling (undeclared `Nope` / `Ghost`,
// a declared but non-parameterisable `Foo`) kept the permissive lowering bug
// 0281's narrow gate does not test for. Bug 0282's own gate in
// `lowerTypeExpr`'s generic-application arm now refuses that head, so this
// group inverts wholesale to the refusal, as its own comment above directed
// ("a re-widening of the gate reds here"). The BARE-name controls beside each
// cell keep bug 0262's landed refusals, unmoved: they are what separates the
// (now refused) applied spelling from a name resolution that moved.
describe("b0281 (D) — an unknown applied head now draws bug 0282's constructor-head refusal", () => {
  it("b0281-D: an unknown applied head refuses and does not register at all nine positions", () => {
    // The alias cell no longer differs from group (M)'s ninth column the way
    // it once did: an unknown head does not break the declaration parse, so
    // `schema S = Nope<integer>` captures the arm text and now refuses it
    // through bug 0282's head gate rather than lowering it permissively.
    const probes = cells([...UNKNOWN_SPELLINGS]);
    expectMatrix(
      probes,
      () => [UNRESOLVED],
      (p) => [unresolvedLine(p.head)],
      () => false,
    );
  });

  it("b0281-D-declared: a DECLARED schema name written with an angle list now refuses the application", () => {
    // Bug 0282 §Reproduction's constraint-dropping measurement, now resolved:
    // `Foo` is declared in the file, the bare annotation enforces it, and
    // under bug 0282 0.280.0's gate the applied spelling of the same head
    // refuses the APPLICATION rather than silently dropping the constraint
    // (grammar.md:107 closes the constructor set; `Foo` resolving as a name
    // does not make it parameterisable).
    const applied = theta(
      "D-declared — `schema Foo { m: string }` + `let a: Foo<integer> = \"mismatch\"`",
      'schema Foo { m: string }\nlet a: Foo<integer> = "mismatch"\n"ok"',
    );
    expectCaptured([applied], ["Foo"]);
    expectRows([applied], [[UNRESOLVED]], () => [[unresolvedLine("Foo")]]);
    expect(
      [[applied.label, registered(applied)]],
      "the applied spelling is refused at the head, so the document no longer registers",
    ).toEqual([[applied.label, false]]);

    const bare = theta(
      "D-declared-control — `schema Foo { m: string }` + `let a: Foo = \"mismatch\"`",
      'schema Foo { m: string }\nlet a: Foo = "mismatch"\n"ok"',
    );
    expectCaptured([bare], ["Foo"]);
    expectRows(
      [bare],
      [[LET_MISMATCH]],
      () => [
        [
          line(LET_MISMATCH, [
            ["<name>", "a"],
            ["<expected>", "Foo"],
            ["<actual>", "string"],
          ]),
        ],
      ],
    );
    expect(
      [[bare.label, registered(bare)]],
      "the bare spelling keeps drawing its own mismatch, so it does not register",
    ).toEqual([[bare.label, false]]);
  });

  it("b0281-D-nesting: an unknown applied head one level down now refuses where the bare name refuses", () => {
    // Bug 0282 §Reproduction's nesting table, now closed: the gate sits at the
    // one recursive lowering seam, so a legal enclosing application no longer
    // shields the interior head — `array<Nope<integer>>` refuses exactly where
    // `array<Nope>` already does. The bare controls below are unmoved (bug
    // 0262's landed rule) and are the other half of that measurement.
    const nested = [
      theta("D-nest-1 — `let a: array<Nope<integer>> = []`", 'let a: array<Nope<integer>> = []\n"ok"'),
      theta("D-nest-2 — `let a: Result<integer, Nope<integer>> = Ok(1)`", 'let a: Result<integer, Nope<integer>> = Ok(1)\n"ok"'),
      theta("D-nest-3 — `@<Result<integer, Nope<integer>>>`", 'let r = @<Result<integer, Nope<integer>>>`q`\n"ok"'),
    ];
    expectCaptured(nested, []);
    const nestedField = theta("D-nest-4 — `schema S { f: array<Nope<integer>> }`", 'schema S { f: array<Nope<integer>> }\n"ok"');
    expectCaptured([nestedField], ["S"]);
    expectRows(
      [...nested, nestedField],
      [...nested, nestedField].map(() => [UNRESOLVED]),
      () => [...nested, nestedField].map(() => [unresolvedLine("Nope")]),
    );
    expect(
      [...nested, nestedField].map((r) => [r.label, registered(r)]),
      "no nesting registers once its interior head is refused",
    ).toEqual([...nested, nestedField].map((r) => [r.label, false]));

    const bare = [
      theta("D-nest-control-1 — `let a: array<Nope> = []`", 'let a: array<Nope> = []\n"ok"'),
    ];
    expectCaptured(bare, []);
    const bareField = theta("D-nest-control-2 — `schema S { f: array<Nope> }`", 'schema S { f: array<Nope> }\n"ok"');
    expectCaptured([bareField], ["S"]);
    expectRows(
      [...bare, bareField],
      [...bare, bareField].map(() => [UNRESOLVED]),
      () => [...bare, bareField].map(() => [unresolvedLine("Nope")]),
    );
  });
});

// ===========================================================================
// (C) The controls that must not move.
// ===========================================================================

describe("b0281 (C) — the closed set, the bare heads and the arity row are unmoved", () => {
  it("b0281-C-array: `array<integer>` stays silent and registering at all nine positions", () => {
    // GREEN at HEAD and the anti-over-broad lock of the whole file. `array` is
    // one of the two heads `GENERIC_ARITY` holds, the committed corpus spells
    // it, and a gate that read membership as a property of the SPELLING rather
    // than of the head would refuse shipped source and red here.
    const probes = cells(["array<integer>"]);
    expectMatrix(
      probes,
      () => [],
      () => [],
      () => true,
    );
  });

  it("b0281-C-result: `Result<T, E>` keeps its own readings at all nine positions", () => {
    // GREEN at HEAD, in three shapes bug 0281 §Reproduction control 2
    // measures. `Result<integer, string>` is silent at the six value-side
    // positions and draws its own lowered-schema row at the three
    // schema-feeding ones — a rule bug 0281 §Non-goals leave alone.
    // `Result<integer, SomeError>` reads the error-side NAME through bug 0262's
    // widening and draws the name refusal, beside the lowered-schema row where
    // that fires; neither line names the head, which is what makes them
    // controls for a gate that judges heads.
    const legal = cells(["Result<integer, string>"]);
    const schemaFeeding = ["schema-field", "schema-alias", "params-field"];
    expectMatrix(
      legal,
      (p) => (schemaFeeding.includes(p.position.id) ? [RESULT_SCHEMA] : []),
      (p) => (schemaFeeding.includes(p.position.id) ? [line(RESULT_SCHEMA)] : []),
      (p) => !schemaFeeding.includes(p.position.id),
    );

    const unresolvedSide = cells(["Result<integer, SomeError>"]);
    expectMatrix(
      unresolvedSide,
      (p) => (schemaFeeding.includes(p.position.id) ? [RESULT_SCHEMA, UNRESOLVED] : [UNRESOLVED]),
      (p) =>
        schemaFeeding.includes(p.position.id)
          ? [line(RESULT_SCHEMA), unresolvedLine("SomeError")]
          : [unresolvedLine("SomeError")],
      () => false,
    );

    const declaredError = theta(
      "C-result-declared — `schema E { m: string }` + `fn f(): Result<integer, E> { Ok(1) }`",
      'schema E { m: string }\nfn f(): Result<integer, E> { Ok(1) }\n"ok"',
    );
    expectCaptured([declaredError], ["E"]);
    expectRows([declaredError], [[]], () => [[]]);
    expect(
      [[declaredError.label, registered(declaredError)]],
      "a `Result` whose error side resolves stays legal and keeps registering",
    ).toEqual([[declaredError.label, true]]);
  });

  it("b0281-C-arity: `Result<integer>` keeps the arity row, and keeps its two silent positions", () => {
    // GREEN at HEAD and the gate-ORDER control. A head the closed set HOLDS is
    // judged by the arity check and never by the membership test, so
    // `Result<integer>` must keep drawing `theta/parse/generic-arity-mismatch`
    // and never the refusals groups (M) and (D) assert. The two positions that
    // stay SILENT are the `"inline-object-shape"` rule set's — the `@<T>`
    // capture's `E` argument and the `invoke<Type>` ascription, which bug 0278
    // §Non-goals and bug 0281 §Non-goals both leave alone; they are also the
    // two positions with no wired not-expression emitter, which is why that
    // family is not the code this file's refusals answer to.
    const silentHere = ["query-E-arg", "invoke-ascr"];
    const schemaFeeding = ["schema-field", "schema-alias", "params-field"];
    const probes = cells(["Result<integer>"]);
    expectMatrix(
      probes,
      (p) =>
        silentHere.includes(p.position.id)
          ? []
          : schemaFeeding.includes(p.position.id)
            ? [ARITY, RESULT_SCHEMA]
            : [ARITY],
      (p) =>
        silentHere.includes(p.position.id)
          ? []
          : schemaFeeding.includes(p.position.id)
            ? [arityLine("Result", 2, 1), line(RESULT_SCHEMA)]
            : [arityLine("Result", 2, 1)],
      (p) => silentHere.includes(p.position.id),
    );
  });

  it("b0281-C-bare: the bare heads keep the refusals bugs 0277 and 0262 landed", () => {
    // GREEN at HEAD. Bug 0281 controls 1 and the adjacency: the UNAPPLIED `Ok`
    // / `Err` refuse at eight positions and refuse the DECLARATION at the alias
    // — a single empty-body line, since the bare head leaves no angle list in
    // statement position — and the bare `Nope` refuses at all nine under bug
    // 0262's landed rule. These are the readings the applied spellings
    // converge on, so a route that moved them would be trading one divergence
    // for another.
    const bareReserved = POSITIONS.flatMap((position) =>
      ["Ok", "Err"].map((head) => ({ position, head, row: position.build(head) })),
    );
    expectMatrix(
      bareReserved,
      (p) => (p.position.id === "schema-alias" ? [EMPTY_SCHEMA] : [RESERVED]),
      (p) =>
        p.position.id === "schema-alias"
          ? [line(EMPTY_SCHEMA, [["<X>", "S"]])]
          : [reservedLine(p.head)],
      () => false,
    );

    const bareName = POSITIONS.map((position) => ({ position, row: position.build("Nope") }));
    expectMatrix(
      bareName,
      () => [UNRESOLVED],
      () => [unresolvedLine("Nope")],
      () => false,
    );
    expect(
      bareName.map((p) => [p.row.label, startPositions(p.row)]),
      "the bare name's own ranges, unmoved by a gate that judges only reserved heads",
    ).toEqual(bareName.map((p) => [p.row.label, [p.position.at]]));
  });
});

// ===========================================================================
// (A) Adjacency — an applied PRIMITIVE-spelled reserved head.
// ===========================================================================

describe("b0281 (A) — a primitive spelling written with an angle list follows the reserved-head routing", () => {
  it("b0281-A: `integer<string>` at the `let` annotation draws the keyword refusal", () => {
    // MEASURED, not derived, in both directions. At HEAD `let a: integer<string> = 3`
    // is SILENT at all nine positions and registers — `integer` is a head
    // `GENERIC_ARITY` does not hold, so the application arm consumes it and
    // nothing judges it, exactly as for `Ok<integer>`. Under the adjudicated
    // per-head-class routing the head is a reserved spelling that is not a
    // constructor keyword, so the narrow gate draws the same row group (M)
    // asserts, at the `let` position's own start. The bare `integer` is a `PrimitiveType`,
    // taken by the primitive test ahead of the reserved branch in
    // `lowerTypeExpr` (`src/parser/params.ts`), and is untouched: the control
    // below is green before and after.
    const applied = theta("A — `let a: integer<string> = 3`", 'let a: integer<string> = 3\n"ok"');
    expectCaptured([applied], []);
    expectRows([applied], [[RESERVED]], () => [[reservedLine("integer")]]);
    expect(
      [[applied.label, startPositions(applied)]],
      "the `let` position speaks at the statement's own start",
    ).toEqual([[applied.label, ["6:1"]]]);
    expect([[applied.label, registered(applied)]], "a refused document is not registered").toEqual([
      [applied.label, false],
    ]);

    const bare = theta("A-control — `let a: integer | null = 3`", 'let a: integer | null = 3\n"ok"');
    expectCaptured([bare], []);
    expectRows([bare], [[]], () => [[]]);
    expect(
      [[bare.label, registered(bare)]],
      "a primitive spelling with no angle list keeps loading and registering",
    ).toEqual([[bare.label, true]]);
  });
});

// ===========================================================================
// (DIAG-2) The registry rows this file asserts against exist and are closed.
// ===========================================================================

describe("b0281 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0281-DIAG-2: all seven codes carry an E row of their own phase and a placeholder-bearing Message", () => {
    // DIAG-2: the registry is closed, so a code a test asserts must have a row
    // (`reconcileClosedSet`, tools/code-registry/index.js). No code is minted
    // here and no registry byte moves at version 0.277.0:
    // `theta/parse/reserved-keyword-as-identifier` enumerates no position in
    // its *Trigger* — "Reserved keyword used in an identifier position."
    // (code-registry-parse.md line 21) — so a constructor-head position is
    // already inside it, a head being read where an `Ident` is read; and
    // `theta/parse/unresolved-named-type` (line 112) is asserted here only for
    // the BARE names its own landed widening already covers. This cell fails
    // loudly on the unmet precondition rather than letting `msg` above
    // substitute into an absent template.
    const rows = [RESERVED, UNRESOLVED, ARITY, RESULT_SCHEMA, EMPTY_SCHEMA, UNSUPPORTED, LET_MISMATCH].map(
      (code) => {
        const r = REGISTRY.find((x) => x.code === code);
        return [code, r?.severity, r?.phase] as const;
      },
    );
    expect(
      rows,
      `DIAG-2: ${REGISTRY_PATH} must carry a closed-set row for each asserted code`,
    ).toEqual([
      [RESERVED, "E", "parse"],
      [UNRESOLVED, "E", "parse"],
      [ARITY, "E", "parse"],
      [RESULT_SCHEMA, "E", "parse"],
      [EMPTY_SCHEMA, "E", "parse"],
      [UNSUPPORTED, "E", "parse"],
      [LET_MISMATCH, "E", "type"],
    ]);
    expect(
      msg(RESERVED, [["<keyword>", "Ok"]]),
      "the keyword refusal's rendered Message must carry the spelling it names",
    ).toContain("Ok");
    expect(
      msg(UNRESOLVED, [["<name>", "Nope"]]),
      "the name refusal's rendered Message must carry the head it names",
    ).toContain("Nope");
  });
});
