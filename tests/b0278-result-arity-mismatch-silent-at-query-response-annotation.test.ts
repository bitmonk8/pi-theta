import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0278 — a wrong-arity `Result` application written at the `@<T>` query
// annotation draws nothing and registers
// (docs/bugs/0278-result-arity-mismatch-silent-at-query-response-annotation.md).
//
// THE SEAM. `walkExpr`'s `"query"` arm (`src/parser/theta-document.ts`) computes
// `queryResponseAnnotation(e.schema)` and guards its ENTIRE annotation-interior
// check block on that value being defined. `queryResponseAnnotation` peels a
// `Result<T, E>` application down to `T` and returns `undefined` for any
// argument count other than two, so at every non-2 count the guard skips the
// whole block: the `parseTypeExpression` position-rule walk, the
// `annotationSourceIsNotTypeExpression` refusal, the response part's
// `collectUnresolvedNamedTypes` loops, and the `E`-side block bug 0273 landed
// inside the same guard. The arity judgement lives in `walkType`'s `"generic"`
// arm (`GENERIC_ARITY`, `src/parser/type-grammar.ts`), reachable from this
// capture only through that walk — so the one diagnostic the peel's own doc
// block defers to another site is never computed at all for an author-written
// ascription. Nothing in that arm treats `Result` differently from `array`:
// `@<array<integer, string>>` is not a `Result` application, so the peel hands
// the walk the text unchanged and the row fires. The asymmetry is produced
// entirely by WHICH TEXT the walk is handed.
//
// THE SETTLED TARGET BEHAVIOUR THIS FILE ENCODES (§Expected behaviour and
// §Fix). A non-arity-2 `Result` application written at the `@<T>` ascription
// draws EXACTLY ONE error-severity `theta/parse/generic-arity-mismatch` at the
// QUERY EXPRESSION's range, carrying the registered *Message* (`generic type
// 'Result' expects 2 type argument(s); got 1` / `got 3`), and the document is
// not registered — the disposition `@<array<integer, string>>` already receives
// at that position, and the disposition the four full-walk positions already
// give the same `Result` text. No code is minted:
// `theta/parse/generic-arity-mismatch` is an existing row whose *Trigger* names
// `Result<T>` as its own example and enumerates no position
// (docs/spec_topics/diagnostics/code-registry-parse.md line 65), over the
// arities the grammar spells (docs/spec_topics/grammar.md lines 99 and 100,
// restated at line 107). No *Message* byte moves under version 0.273.0. An
// error-severity `theta/parse/*` diagnostic denies registration — the GOV-15
// loads-cleanly reading (docs/spec_topics/governance/source-language-stability.md
// line 9).
//
// THE INTERIOR OF A WRONG-ARITY APPLICATION STAYS UNRESOLVED, and that is
// §Fix constraint 1, group (A) below. The peel cannot say which argument would
// have been `T`, and descending the application would name the builtin
// `QueryError` and every stray argument as unresolved beside the real fault —
// the ground `queryResponseAnnotation`'s own doc block states. One arity line
// is the whole verdict: `@<Result<Ghost>>` draws arity ALONE, with no `Ghost`
// line, and `@<Result<void>>`, `@<Result<{}>>`, `@<Result<match>>` and
// `@<Result<integer|>>` likewise draw arity alone rather than
// `void-in-non-return-position`, `empty-schema-body`,
// `reserved-keyword-as-identifier` or `query-annotation-type-not-expression`.
//
// WHAT IS RED HERE AND WHY. Groups (R), (A-red) and (KW) assert one refusal
// where the parser at HEAD produces an EMPTY diagnostic list, so each red reads
// "expected [theta/parse/generic-arity-mismatch], received []". Every other
// group is measured at HEAD and green there, and must stay green under the
// change: group (M) the four full-walk columns and the `invoke<T>` column,
// group (A-green) rows A3, A8 and A9, group (P) §Fix constraint 2, group (C)
// §Fix constraint 3, group (B) §Fix constraint 4, and group (N) the nested
// application.
//
// BOUNDS THIS FILE ALSO LOCKS, EACH FROM §Non-goals:
//
//   The propagated route's count. `let r: Result<integer> = @`q`` draws its one
//   arity line from `walkStatement`'s `let` arm at the STATEMENT's range
//   (column 1), and the query arm's
//   `e.schemaFromLetAnnotation === true` withhold — bug 0093 §Fix route 2, the
//   reason the query-side walk is denied propagated text — governs the new call
//   too. Group (P) asserts the COUNT beside the POSITION, because a count of
//   one is also what a route would show that emitted at the query arm while the
//   `let` arm went silent.
//
//   The bracket residual. `Result<enum["a", "b"], string>` is a legal
//   two-argument application whose interior the peel's `splitTopLevel` counts
//   as three, because that split tracks angle and brace depth and not bracket
//   depth (bugs 0204 and 0236, left in place by §Non-goals). A route that fires
//   the arity row off `splitTopLevel`'s count rather than off `TypeParser`'s own
//   argument count manufactures a FALSE refusal for that legal spelling. Group
//   (B) is the sharpest cell in the file for exactly that reason.
//
//   The `TypePosition`. The `@<T>` ascription walks as `"value"`, so
//   `theta/parse/result-in-schema-position` must never appear at it; widening
//   the position there is forbidden by §Fix constraint 3. Group (C) asserts
//   that code's absence across every fixture in the file, not only its own.
//
//   The `invoke<T>` column. That capture withholds the `"all"`-only rules by
//   decision (bug 0045 §Fix), which is why `array<integer, string>` is silent
//   there too. It is not this report's subject and group (M) locks it silent.
//
//   Bug 0277's UNAPPLIED head (`let a: Result = 3`) and bug 0273's `E`-side
//   name walk are separate subjects; no fixture here writes a bare `Result`
//   head, and no cell here asks for name resolution inside a wrong-arity
//   application.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (`tests/helpers/e2e-s1.ts` — the shipped whole-file entry point wrapped in
// inert deps, no behaviour stubbed). An integration tier would add a round trip
// to a value already fixed at the parse boundary and observe nothing sharper; a
// live tier cannot see a parse-time diagnostic LIST at all, only the
// registration outcome it implies, which the standalone live cell
// `tests/live/b0278live-result-arity-mismatch-registration.test.ts` covers.
// Registration is asserted here through the composition root's own predicate
// rather than a live load.
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
// diagnostic nor one at the wrong position can hide. `Ghost` is declared and
// imported nowhere.

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

/** The row this bug's inputs must draw at the `@<T>` ascription. */
const ARITY = "theta/parse/generic-arity-mismatch";
/** The name row the arity-2 controls keep, and which a wrong-arity interior must NOT gain. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
/** Forbidden at this capture by §Fix constraint 3: the ascription walks as `"value"`. */
const SCHEMA_POSITION = "theta/parse/result-in-schema-position";

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

/** The arity refusal, rendered for one constructor, its declared arity and the written count. */
function arityLine(ctor: string, expected: number, actual: number): string {
  return line(ARITY, [
    ["<ctor>", ctor],
    ["<expected>", String(expected)],
    ["<actual>", String(actual)],
  ]);
}

/** The name refusal the arity-2 controls keep. */
function unresolvedLine(name: string): string {
  return line(UNRESOLVED, [["<name>", name]]);
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

/** The frontmatter every fixture carries, per the bug document's §Reproduction. */
const FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

/** Every row this file builds, so group (C)'s corpus-wide absence assertion can read them all. */
const ALL_ROWS: LoadRow[] = [];

/** A `mode: prompt` theta whose body is `body` verbatim, parsed once. */
function theta(label: string, body: string): LoadRow {
  const doc = parseDoc(`${FRONTMATTER}${body}\n`, "b0278.theta");
  const row: LoadRow = {
    label,
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    lines: doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
    declared: doc.body.statements
      .filter((s) => s.kind === "schema" || s.kind === "enum")
      .map((s) => (s as { name: string }).name),
    statements: doc.body.statements.length,
    doc,
  };
  ALL_ROWS.push(row);
  return row;
}

/**
 * The composition root's registration gate, mirrored: `hasLoadParseError`
 * (`src/extension/production-composition.ts`) is
 * `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
 * d.code.startsWith("theta/parse/")))`, and a document carrying one is not
 * registered. Every diagnostic below is a `theta/parse/…` code, so the
 * code-prefix half of the real predicate always holds here.
 */
function registered(row: LoadRow): boolean {
  return !row.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

/**
 * The 1-indexed `line:column` start of each diagnostic in a row. The two routes
 * this bug separates emit at different columns of one source line — the query
 * arm at the query EXPRESSION's own start, `walkStatement`'s `let` arm at the
 * STATEMENT's start (column 1) — so the column is what reads WHICH route spoke.
 */
function startPositions(row: LoadRow): string[] {
  return row.doc.diagnostics.map((d: Diagnostic) =>
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
  expect(rows.map((r) => [r.label, r.codes])).toEqual(
    rows.map((r, i) => [r.label, expected[i]]),
  );
  const wanted = expectedLines();
  expect(rows.map((r) => [r.label, r.lines])).toEqual(
    rows.map((r, i) => [r.label, wanted[i]]),
  );
}

/**
 * The column an author-written `@<T>` ascription's own diagnostic sits at in
 * every fixture here: the query expression begins at `let r = `'s end. Measured
 * for `@<array<integer, string>>` at HEAD, which is the disposition §Expected
 * behaviour names as the one the `Result` spelling must join.
 */
const QUERY_COLUMN = "6:9";
/** The column `walkStatement`'s `let` arm speaks at — the statement's own start. */
const STATEMENT_COLUMN = "6:1";

// ===========================================================================
// (R) The report's headline: the two wrong-arity ascriptions are refused.
// ===========================================================================

describe("b0278 (R) — a non-arity-2 `Result` written at `@<T>` draws the arity refusal", () => {
  it("b0278-R: the arity-1 and arity-3 ascriptions each draw exactly one arity line", () => {
    // RED at HEAD, and the heart of the report: both lists are EMPTY there,
    // because `queryResponseAnnotation` declines every non-2 count and the
    // caller's guard skips the walk that computes the arity. The written count
    // is carried in the *Message*, so the two rows cannot satisfy each other's
    // assertion.
    const r1 = theta("R1 — `@<Result<integer>>`", 'let r = @<Result<integer>>`q`\n"ok"');
    const r3 = theta(
      "R3 — `@<Result<integer, string, boolean>>`",
      'let r = @<Result<integer, string, boolean>>`q`\n"ok"',
    );
    const rows = [r1, r3];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [ARITY]),
      () => [[arityLine("Result", 2, 1)], [arityLine("Result", 2, 3)]],
    );
  });

  it("b0278-R-position: each refusal sits at the query expression's own range", () => {
    // §Expected behaviour fixes the range rather than choosing one: the same
    // range `@<array<integer, string>>` already draws at this position, which
    // is the query expression's start and not the `let` statement's column 1.
    // This cell reds on a route that emitted the right code from the `let`
    // capture — the route §Fix constraint 2 forbids.
    const rows = [
      theta("R1-position — `@<Result<integer>>`", 'let r = @<Result<integer>>`q`\n"ok"'),
      theta(
        "R3-position — `@<Result<integer, string, boolean>>`",
        'let r = @<Result<integer, string, boolean>>`q`\n"ok"',
      ),
      theta(
        "R-control-position — `@<array<integer, string>>` (already refused at HEAD)",
        'let r = @<array<integer, string>>`q`\n"ok"',
      ),
    ];
    expectCaptured(rows, []);
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the author-written ascription's arity refusal speaks at the query expression, exactly where the `array` spelling already speaks",
    ).toEqual(rows.map((r) => [r.label, [QUERY_COLUMN]]));
  });

  it("b0278-R-registration: an error-severity arity refusal denies registration", () => {
    // The GOV-15 loads-cleanly reading
    // (docs/spec_topics/governance/source-language-stability.md line 9): an `E`
    // denies registration. At HEAD both rows register — §Reproduction's
    // "SILENT, reg" cells, and the reason a theta whose query annotation is
    // malformed runs and validates its response against `{}`.
    const rows = [
      theta("R1-registration — `@<Result<integer>>`", 'let r = @<Result<integer>>`q`\n"ok"'),
      theta(
        "R3-registration — `@<Result<integer, string, boolean>>`",
        'let r = @<Result<integer, string, boolean>>`q`\n"ok"',
      ),
    ];
    expectCaptured(rows, []);
    expect(
      rows.map((r) => [r.label, r.doc.diagnostics.map((d: Diagnostic) => d.severity)]),
      `${ARITY} is an E row, so its emission must be error-severity here`,
    ).toEqual(rows.map((r) => [r.label, ["error"]]));
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "a refused document is not registered",
    ).toEqual(rows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (M) §Reproduction's five-spellings × six-positions matrix.
// ===========================================================================

describe("b0278 (M) — only the `@<T>` ascription column moves", () => {
  it("b0278-M-fullwalk: the four full-walk positions keep their single arity line at the statement range", () => {
    // GREEN at HEAD and required green after: the propagated `let`, the `fn`
    // return, the `fn` parameter and the non-query `let` each run the whole
    // annotation through `walkType` already, so the row fires there for the
    // same `Result` text that is silent at the ascription. They are the
    // control that makes the ascription's silence attributable to WHICH TEXT
    // the query capture hands the walk, rather than to a `Result` special case
    // inside the arity arm.
    const rows = [
      theta("M-prop-1 — `let r: Result<integer> = @`q``", 'let r: Result<integer> = @`q`\n"ok"'),
      theta(
        "M-prop-3 — `let r: Result<integer, string, boolean> = @`q``",
        'let r: Result<integer, string, boolean> = @`q`\n"ok"',
      ),
      theta("M-fnret-1 — `fn f(): Result<integer> { 3 }`", "fn f(): Result<integer> { 3 }\n\"ok\""),
      theta(
        "M-fnparam-1 — `fn f(a: Result<integer>): integer { 3 }`",
        'fn f(a: Result<integer>): integer { 3 }\nlet z = f(Ok(1))\n"ok"',
      ),
      theta("M-let-1 — `let a: Result<integer> = 3`", 'let a: Result<integer> = 3\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [ARITY]),
      () => [
        [arityLine("Result", 2, 1)],
        [arityLine("Result", 2, 3)],
        [arityLine("Result", 2, 1)],
        [arityLine("Result", 2, 1)],
        [arityLine("Result", 2, 1)],
      ],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "each full-walk position speaks at its own statement's start",
    ).toEqual(rows.map((r) => [r.label, [STATEMENT_COLUMN]]));
  });

  it("b0278-M-invoke: the `invoke<T>` column stays silent for both constructors", () => {
    // §Non-goals: that capture withholds the `"all"`-only rules by decision
    // (bug 0045 §Fix), which is why the `array` spelling is silent there too.
    // Locked here so a route that reached for the arity row by widening the
    // shared `rules` argument reds on this cell rather than shipping a change
    // this report did not ask for.
    const rows = [
      theta(
        "M-invoke-Result — `invoke<Result<integer>>`",
        'let r = invoke<Result<integer>>("./x.theta")\n"ok"',
      ),
      theta(
        "M-invoke-array — `invoke<array<integer, string>>`",
        'let r = invoke<array<integer, string>>("./x.theta")\n"ok"',
      ),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => []),
      () => rows.map(() => []),
    );
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "the `invoke<T>` column registers before and after, for both constructors alike",
    ).toEqual(rows.map((r) => [r.label, true]));
  });
});

// ===========================================================================
// (A) §Reproduction's swallow table, and §Fix constraint 1.
// ===========================================================================

describe("b0278 (A) — the skipped block's five swallowed rows resolve to one arity line", () => {
  it("b0278-A-red: rows A1, A2, A4, A5, A6 and A7 each draw arity ALONE", () => {
    // RED at HEAD — every list is empty — and the file's statement of §Fix
    // constraint 1. Each fixture writes ONE annotation carrying ONE fault the
    // arity row owns, and the interior stays unresolved: no `Ghost` line beside
    // A1, no `void-in-non-return-position` beside A4, no `empty-schema-body`
    // beside A5, no `reserved-keyword-as-identifier` beside A6, no
    // `query-annotation-type-not-expression` beside A7. The whole-list equality
    // is what makes that "alone" assertable — a route that descended the
    // malformed interior reds here with a second line, naming it.
    const rows = [
      theta("A1 — `@<Result<Ghost>>`", 'let r = @<Result<Ghost>>`q`\n"ok"'),
      theta("A2 — `@<Result<Ghost, string, boolean>>`", 'let r = @<Result<Ghost, string, boolean>>`q`\n"ok"'),
      theta("A4 — `@<Result<void>>`", 'let r = @<Result<void>>`q`\n"ok"'),
      theta("A5 — `@<Result<{}>>`", 'let r = @<Result<{}>>`q`\n"ok"'),
      theta("A6 — `@<Result<match>>`", 'let r = @<Result<match>>`q`\n"ok"'),
      theta("A7 — `@<Result<integer|>>`", 'let r = @<Result<integer|>>`q`\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [ARITY]),
      () => [
        [arityLine("Result", 2, 1)],
        [arityLine("Result", 2, 3)],
        [arityLine("Result", 2, 1)],
        [arityLine("Result", 2, 1)],
        [arityLine("Result", 2, 1)],
        [arityLine("Result", 2, 1)],
      ],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "one written annotation draws one line, at the query expression's own range",
    ).toEqual(rows.map((r) => [r.label, [QUERY_COLUMN]]));
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "none of the six registers once its annotation is refused",
    ).toEqual(rows.map((r) => [r.label, false]));
  });

  it("b0278-A-green: rows A3, A8 and A9 are byte-identical before and after", () => {
    // GREEN at HEAD. A3 is the arity-2 control whose undeclared response head
    // IS refused today — A1 against A3 is the widened face of the report, one
    // extra type argument turning a load refusal into silence — and it keeps
    // its single name line, since this report asks for no new name resolution.
    // A8 is the `array` spelling at the same position, which already draws both
    // lines and fixes the order the `Result` spelling is NOT asked to copy: its
    // interior is well-formed enough to descend, a wrong-arity `Result`'s is
    // not. A9 is the propagated route reporting arity once, at the statement.
    const a3 = theta("A3 — `@<Result<Ghost, string>>` (arity-2 control)", 'let r = @<Result<Ghost, string>>`q`\n"ok"');
    const a8 = theta("A8 — `@<array<Ghost, string>>` (control)", 'let r = @<array<Ghost, string>>`q`\n"ok"');
    const a9 = theta("A9 — `let r: Result<Ghost> = @`q`` (propagated)", 'let r: Result<Ghost> = @`q`\n"ok"');
    const rows = [a3, a8, a9];
    expectCaptured(rows, []);
    expectRows(
      rows,
      [[UNRESOLVED], [ARITY, UNRESOLVED], [ARITY]],
      () => [
        [unresolvedLine("Ghost")],
        [arityLine("array", 1, 2), unresolvedLine("Ghost")],
        [arityLine("Result", 2, 1)],
      ],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the two written ascriptions speak at the query expression; the propagated row speaks at its `let` statement",
    ).toEqual([
      [a3.label, [QUERY_COLUMN]],
      [a8.label, [QUERY_COLUMN, QUERY_COLUMN]],
      [a9.label, [STATEMENT_COLUMN]],
    ]);
  });
});

// ===========================================================================
// (P) §Fix constraint 2 — no double emission on the propagated route.
// ===========================================================================

describe("b0278 (P) — the propagated annotation keeps exactly one arity line, at the `let`", () => {
  it("b0278-P: the count and the position both hold for the arity-1 and arity-3 propagations", () => {
    // GREEN at HEAD and the constraint most at risk from the fix: the new pass
    // over the whole annotation must inherit the
    // `e.schemaFromLetAnnotation === true` withhold the query arm already
    // carries (bug 0093 §Fix route 2), or the one written annotation draws two
    // byte-identical arity lines at two ranges. The COUNT alone cannot separate
    // the compliant route from one where the query arm emitted and the `let`
    // arm went silent, so the POSITION is asserted beside it.
    const rows = [
      theta("P1 — `let r: Result<integer> = @`q``", 'let r: Result<integer> = @`q`\n"ok"'),
      theta(
        "P3 — `let r: Result<integer, string, boolean> = @`q``",
        'let r: Result<integer, string, boolean> = @`q`\n"ok"',
      ),
    ];
    expectCaptured(rows, []);
    expect(
      rows.map((r) => [r.label, r.codes.length]),
      "one written annotation draws one arity line; the query-side walk is withheld for propagated text",
    ).toEqual(rows.map((r) => [r.label, 1]));
    expectRows(
      rows,
      rows.map(() => [ARITY]),
      () => [[arityLine("Result", 2, 1)], [arityLine("Result", 2, 3)]],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the line stays at the `let` statement's own column 1, never at the initialiser's `@`",
    ).toEqual(rows.map((r) => [r.label, [STATEMENT_COLUMN]]));
  });
});

// ===========================================================================
// (C) §Fix constraint 3 — no new line for any legal spelling.
// ===========================================================================

describe("b0278 (C) — every arity-2 and arity-1-`array` spelling is byte-identical after", () => {
  it("b0278-C: the five legal ascriptions keep their HEAD dispositions", () => {
    // GREEN at HEAD, and the anti-over-broad half of the report. Each row is a
    // spelling the fix must not touch: two legal `Result` applications (one
    // with an inline object response part, which is why the peel's split tracks
    // brace depth at all), the arity-1 `array`, a declared schema name, and an
    // undeclared bare head that keeps its single name refusal rather than
    // gaining an arity line. `@<Result<integer, void>>` is in the group because
    // its `E` argument is a position fault the guard also skips today, and
    // §Fix requires it to stay exactly as measured rather than to move as a
    // side effect of the new pass.
    const c1 = theta("C1 — `@<Result<integer, string>>`", 'let r = @<Result<integer, string>>`q`\n"ok"');
    const c2 = theta(
      "C2 — `@<Result<{a: string, b: integer}, QueryError>>`",
      'let r = @<Result<{a: string, b: integer}, QueryError>>`q`\n"ok"',
    );
    const c3 = theta("C3 — `@<array<integer>>`", 'let r = @<array<integer>>`q`\n"ok"');
    const c4 = theta("C4 — `@<Result<integer, void>>`", 'let r = @<Result<integer, void>>`q`\n"ok"');
    const rows = [c1, c2, c3, c4];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => []),
      () => rows.map(() => []),
    );
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "every legal ascription keeps registering",
    ).toEqual(rows.map((r) => [r.label, true]));

    const c5 = theta("C5 — `@<Ghost>` (bare undeclared head)", 'let r = @<Ghost>`q`\n"ok"');
    expectCaptured([c5], []);
    expectRows([c5], [[UNRESOLVED]], () => [[unresolvedLine("Ghost")]]);
    expect(
      [[c5.label, startPositions(c5)]],
      "the bare head keeps its single name refusal at the query expression, with no arity line beside it",
    ).toEqual([[c5.label, [QUERY_COLUMN]]]);

    const c6 = theta(
      "C6 — `@<Schema>` (declared head)",
      'schema Schema { a: string }\nlet r = @<Schema>`q`\n"ok"',
    );
    expectCaptured([c6], ["Schema"]);
    expectRows([c6], [[]], () => [[]]);
    expect([[c6.label, registered(c6)]], "a declared response schema keeps registering").toEqual([
      [c6.label, true],
    ]);
  });

  it("b0278-C-no-schema-position: no fixture in this file draws `result-in-schema-position`", () => {
    // §Fix constraint 3's second half, asserted corpus-wide over every row this
    // file builds rather than only over its own group. The `@<T>` ascription
    // walks as `TypePosition` `"value"`, so a route that reached the arity mint
    // by handing the walk a schema-feeding position would light this code up
    // across many rows at once; asserting its absence in one group would let it
    // hide in the others. `ALL_ROWS` is populated by `theta` itself, so a row
    // added later is covered without being listed here.
    expect(
      ALL_ROWS.length,
      "precondition: the corpus-wide scan must have rows to scan; an empty list would pass vacuously",
    ).toBeGreaterThan(20);
    expect(
      ALL_ROWS.filter((r) => r.codes.includes(SCHEMA_POSITION)).map((r) => r.label),
      `${SCHEMA_POSITION} is not reachable from a "value" position, so no fixture here may draw it`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (B) §Fix constraint 4 — the bracket residual draws no false arity line.
// ===========================================================================

describe("b0278 (B) — a legal two-argument application the peel's split counts as three", () => {
  it("b0278-B: `@<Result<enum[\"a\", \"b\"], string>>` gains no arity line", () => {
    // GREEN at HEAD and the sharpest cell in the file. `splitTopLevel` tracks
    // angle and brace depth and NOT bracket depth, so it cuts this legal
    // two-argument application into three segments and the peel declines it on
    // the same non-2 path the wrong-arity spellings take (bugs 0204 and 0236,
    // left in place by §Non-goals). A fix that fires the arity row off THAT
    // count manufactures a refusal for source the grammar admits — the one way
    // this change can break legal code. The judgement must come from
    // `TypeParser`'s own argument count instead, which already counts two here.
    const rows = [
      theta(
        'B1 — `@<Result<enum["a", "b"], string>>`',
        'let r = @<Result<enum["a", "b"], string>>`q`\n"ok"',
      ),
      theta(
        'B2 — `let x: Result<enum["a", "b"], string> = @`q`` (propagated)',
        'let x: Result<enum["a", "b"], string> = @`q`\n"ok"',
      ),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => []),
      () => rows.map(() => []),
    );
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "a legal two-argument application registers, whichever count the peel's split reports",
    ).toEqual(rows.map((r) => [r.label, true]));
  });
});

// ===========================================================================
// (N) A wrong-arity application NESTED inside a legal one draws one line.
// ===========================================================================

describe("b0278 (N) — the nested application keeps exactly one arity line", () => {
  it("b0278-N: `@<Result<Result<integer>, string>>` draws one line, not two", () => {
    // GREEN at HEAD, where the single line comes from the walk over the PEELED
    // response part `Result<integer>` — the direct evidence that the arity mint
    // is already reachable from this capture and that only the OUTER
    // application is withheld from it. Under the fix the whole annotation is
    // walked, and this row is the tripwire for a route that walks the peeled
    // text AS WELL and doubles the line: §Expected behaviour's "one arity line
    // is the whole verdict" holds for one written mistake here too.
    const row = theta(
      "N1 — `@<Result<Result<integer>, string>>`",
      'let r = @<Result<Result<integer>, string>>`q`\n"ok"',
    );
    expectCaptured([row], []);
    expectRows([row], [[ARITY]], () => [[arityLine("Result", 2, 1)]]);
    expect(
      [[row.label, startPositions(row)]],
      "the nested application's single line sits at the query expression",
    ).toEqual([[row.label, [QUERY_COLUMN]]]);
  });
});

// ===========================================================================
// (KW) The arity-3 keyword spelling — arity alone, no keyword head presented.
// ===========================================================================

describe("b0278 (KW) — an arity-3 application carrying a reserved head draws arity alone", () => {
  it("b0278-KW: `@<Result<integer, match, string>>` draws the arity line and no keyword line", () => {
    // RED at HEAD (empty list), and the cell that reconciles this fix with bug
    // 0274's §Non-goals. `queryErrorModelAnnotation` declines the non-2 count,
    // so the arm descends nothing and the reserved head is presented to NO
    // sink — that stays true here: the fix walks the annotation for its
    // POSITION RULES only, and asks for no name resolution and no keyword
    // collection inside a wrong-arity application (§Fix constraint 1). What
    // changes is that the application's own arity is finally reported. A route
    // that widened the peel instead of walking the whole text reds here with a
    // `reserved-keyword-as-identifier` line beside the arity line.
    const rows = ["match", "return"].map((k) =>
      theta(`KW (${k}) — \`@<Result<integer, ${k}, string>>\``, `let r = @<Result<integer, ${k}, string>>\`q\`\n"ok"`),
    );
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [ARITY]),
      () => rows.map(() => [arityLine("Result", 2, 3)]),
    );
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "the arity refusal denies registration to both spellings",
    ).toEqual(rows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (DIAG-2) The registry rows this file asserts against exist and are closed.
// ===========================================================================

describe("b0278 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0278-DIAG-2: all three codes carry an E/parse row, and the arity Message carries its three placeholders", () => {
    // DIAG-2: the registry is closed, so a code a test asserts must have a row
    // (`reconcileClosedSet`, `tools/code-registry/index.js`). No code is minted
    // here. The `theta/parse/generic-arity-mismatch` row's *Trigger* names
    // `Result<T>` as its own example and enumerates no position, so the query
    // ascription entering its emission set makes the behaviour match the row as
    // registered — which is why no *Message* byte and no row moves under
    // version 0.273.0. This cell fails loudly on the unmet precondition rather
    // than letting `msg` above substitute into an absent template.
    const rows = [ARITY, UNRESOLVED, SCHEMA_POSITION].map((code) => {
      const row = REGISTRY.find((r) => r.code === code);
      return [code, row?.severity, row?.phase] as const;
    });
    expect(
      rows,
      `DIAG-2: ${REGISTRY_PATH} must carry a closed-set row for each asserted code`,
    ).toEqual([
      [ARITY, "E", "parse"],
      [UNRESOLVED, "E", "parse"],
      [SCHEMA_POSITION, "E", "parse"],
    ]);
    expect(
      arityLine("Result", 2, 1),
      "the arity refusal's rendered Message must name the constructor, its declared arity and the written count",
    ).toContain("Result");
    expect(
      unresolvedLine("Ghost"),
      "the name refusal's rendered Message must carry the head it names",
    ).toContain("Ghost");
  });
});
