import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0273 — an unresolvable `NamedType` written in the `E` argument of a
// `Result<T, E>` annotation that reaches the `@<T>` query capture draws nothing
// (docs/bugs/0273-propagated-result-error-side-unresolved-name-silent.md).
//
// THE SEAM. `queryResponseAnnotation` (`src/parser/theta-document.ts`) peels a
// `Result<T, E>` application down to `T` and returns that text alone;
// `walkExpr`'s `"query"` arm consumes it, so every judgement below the peel —
// the position-rule walk, the `annotationSourceIsNotTypeExpression` refusal,
// the reserved-keyword loop and `collectUnresolvedNamedTypes`
// (`src/parser/body-type-lowering.ts`) — never sees `args[1]`. The peel exists
// to protect the builtin `QueryError`, which a query's declared value type
// `Result<T, QueryError>` (QRY-1) carries onto this capture and which resolves
// to no declaration by design; it protects the whole argument slot instead of
// the builtin, so any head written there is discarded unseen.
//
// TWO ROUTES REACH THE CAPTURE WITH AUTHOR-WRITTEN `E`-SIDE TEXT. `parseLet`
// (`src/parser/theta-document.ts`) propagates a `let` annotation verbatim onto
// a bare-query initialiser (bug 0093's route 2) and bug 0262 §Fix clause
// (iv)(2) makes this arm that text's sole emitter — the `let` capture withholds
// its own resolution of it (`schemaFromLetAnnotation`). An author-written
// `@<Result<T, E>>` ascription arrives here directly.
//
// THE SETTLED TARGET BEHAVIOUR THIS FILE ENCODES (the bug document's §Expected
// behaviour and §Fix). Both arguments of a `Result` application are a recursive
// `Type` (docs/spec_topics/grammar.md line 107), so a `NamedType` written in
// `E` is a reference position, and the registry row at
// docs/spec_topics/diagnostics/code-registry-parse.md line 112 already states
// that every `Result` argument nested inside the `@<T>` query annotation
// refuses an unresolvable head — the change makes the code match the row, and
// no *Message* byte and no registry row moves. Fixtures a–d draw exactly one
// `theta/parse/unresolved-named-type` and do not register: an error-severity
// `theta/parse/*` diagnostic denies registration, the GOV-15 loads-cleanly
// reading (docs/spec_topics/governance/source-language-stability.md line 9).
//
// WHAT IS RED HERE AND WHY. The four cells of group (E) — §Reproduction rows a
// through d, the propagated and the author-written spelling at both the `Nope`
// and the `nope` head — assert one refusal where the parser at HEAD produces an
// EMPTY diagnostic list, so each red reads "expected
// [theta/parse/unresolved-named-type], observed []". Every other group is a
// control measured at HEAD and green there: group (asym) carries rows e–i, the
// `fn` return, `fn` parameter and non-query-`let` captures where the SAME
// `E`-side head already refuses — that asymmetry is this bug's sharp face, and
// a fix that moved any of those five cells has changed a position the bug
// document's §Non-goals leave alone. Group (T) carries rows j–k, group (neg)
// rows l–m, group (arity) the non-arity-2 path, and group (count) the emission
// count the §Non-goals hold at one.
//
// BOUNDS THIS FILE ALSO LOCKS, EACH FROM §Non-goals:
//
//   Emission count. One written annotation draws one refusal. Bug 0093's
//   per-query rule and bug 0262 §Fix clause (iv)(2) both hold: the query arm is
//   the propagated text's sole emitter and the `let` capture stays withheld, so
//   the count for row a must not rise to two. Group (count) reads the surviving
//   line's POSITION as well as the count, because the count alone cannot
//   separate "the query arm gained the `E` side" from "the `let` capture started
//   emitting and the query arm went silent".
//
//   The non-arity-2 path. `queryResponseAnnotation` returns `undefined` on any
//   argument count other than two and the arm descends nothing, so
//   `theta/parse/generic-arity-mismatch` keeps its interior. Group (arity)
//   asserts the disposition MEASURED at HEAD, at both the written-ascription
//   and the propagated spelling, including an arity-3 application carrying the
//   undeclared `Nope` in a non-`T` argument: the change is confined to the
//   arity-2 path, so that spelling stays silent under it.
//
//   The `T` side and the builtin admission. Rows j–k are correct at HEAD and
//   byte-stable; `QueryError` and a declared head stay silent (rows l–m), which
//   is the peel's stated purpose and what keeps the shipped
//   `docs/examples/personas.thetalib` — `Result<integer, QueryError>` — loading
//   under `tests/committed-fixture-parse-gate.test.ts`.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (`tests/helpers/e2e-s1.ts` — the shipped whole-file entry point wrapped in
// inert deps, no behaviour stubbed). An integration tier would add a round trip
// to a value already fixed at the parse boundary and observe nothing sharper; a
// live tier cannot see a parse-time diagnostic list at all, only the
// registration outcome it implies, which `registered` below reads off the
// composition root's own predicate.
//
// NO SILENT SKIPPING. Nothing here early-returns, branches on the environment
// or skips. `msg` asserts its registry row is present and carries each
// placeholder it fills before substituting, and every cell asserts its fixture
// captured a body statement and exactly the declarations it names BEFORE
// reading a disposition off it — a fixture the parser dropped upstream reds by
// naming the loss instead of passing on an empty list that reads as a clean
// load.
//
// ANTI-VACUITY. Every cell asserts an ORDERED WHOLE-LIST equality over the
// UNFILTERED `doc.diagnostics` — never containment — so neither an extra
// diagnostic nor one at the wrong position can hide. Neither `Nope` nor `nope`
// is declared or imported in any fixture except row l, whose whole point is the
// declaration.

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

/** The row the `E`-side resolution emits; its *Message* does not move. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
/** Group (arity): the row whose interior the non-arity-2 path leaves untouched. */
const ARITY = "theta/parse/generic-arity-mismatch";

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

/** The refusal, rendered for the head `name`. */
function unresolvedLine(name: string): string {
  return line(UNRESOLVED, [["<name>", name]]);
}

/** The arity verdict, rendered for a `Result` application given `actual` arguments. */
function arityLine(actual: string): string {
  return line(ARITY, [
    ["<ctor>", "Result"],
    ["<expected>", "2"],
    ["<actual>", actual],
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

/** The frontmatter every fixture carries, per the bug document's §Reproduction. */
const FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

/** A `mode: prompt` theta whose body is `body` verbatim, parsed once. */
function theta(label: string, body: string): LoadRow {
  const doc = parseDoc(`${FRONTMATTER}${body}\n`, "b0273.theta");
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
 * The 1-indexed `line:column` start of each diagnostic in a row. The captures
 * this bug separates — the `let` statement at column 1 and the query expression
 * further along the same source line — differ by column alone, so the column is
 * what reads WHICH capture spoke.
 */
function startPositions(row: LoadRow): string[] {
  return row.doc.diagnostics.map((d: Diagnostic) =>
    d.range === undefined ? "unlocated" : `${d.range.start.line}:${d.range.start.column}`,
  );
}

/**
 * Assert every row parsed to a body and captured exactly the declarations it
 * names, before any disposition is read off it. A dropped statement produces an
 * empty diagnostic list, which is indistinguishable from a clean load unless
 * the capture is asserted separately — this is the precondition, failing
 * loudly.
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

// ===========================================================================
// (E) Rows a through d — the `E`-side head at the query capture.
// ===========================================================================

describe("b0273 (E) — an unresolvable `E` argument at the `@<T>` query capture is refused", () => {
  it("b0273-E: the propagated and the author-written spelling each draw exactly one refusal", () => {
    // The heart of the report, and the only red group. At HEAD all four
    // diagnostic lists are EMPTY: `queryResponseAnnotation` hands the arm `T`
    // alone, so `Nope` and `nope` are never presented to
    // `collectUnresolvedNamedTypes` at all. Under the settled route the arm
    // resolves names in `args[1]` and pushes one refusal per name it returns,
    // at the query expression's range. The universe that second resolution
    // reads is `refs.typeNames` WIDENED by `withBuiltinErrorModelNames`
    // (`src/parser/theta-document.ts`) — the bare set is what the response-side
    // loop uses, and the `E` slot needs the builtin error-model admission the
    // `let`, `fn` parameter, `fn` return and `invoke<Type>` captures already
    // carry, because that admission is what keeps row m below and the shipped
    // `docs/examples/personas.thetalib` (`Result<integer, QueryError>`) clean.
    //
    // Rows a and c are the PROPAGATED route: `parseLet` writes the `let`
    // annotation verbatim onto the bare-query initialiser, so the whole
    // `Result<…>` value type arrives at this capture. Rows b and d are the
    // AUTHOR-WRITTEN `@<Result<T, E>>` ascription, which arrives here with no
    // second capture behind it at all. Both head spellings are probed because
    // `resolveNamed`'s A–Z read-seam fence (`src/parser/type-compat.ts`, bug
    // 0135's §Fix) makes a lowercase head unresolvable by construction while
    // the capture tests resolution rather than case.
    const rows = [
      theta("a — `let a: Result<integer, Nope> = @`q`` (propagated)", 'let a: Result<integer, Nope> = @`q`\n"ok"'),
      theta("b — `let r = @<Result<integer, Nope>>`q`` (author-written)", 'let r = @<Result<integer, Nope>>`q`\n"ok"'),
      theta("c — `let a: Result<integer, nope> = @`q`` (propagated)", 'let a: Result<integer, nope> = @`q`\n"ok"'),
      theta("d — `let r = @<Result<integer, nope>>`q`` (author-written)", 'let r = @<Result<integer, nope>>`q`\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [UNRESOLVED]),
      () => [
        [unresolvedLine("Nope")],
        [unresolvedLine("Nope")],
        [unresolvedLine("nope")],
        [unresolvedLine("nope")],
      ],
    );
  });

  it("b0273-E-registration: an error-severity refusal denies registration at all four spellings", () => {
    // The GOV-15 loads-cleanly reading
    // (docs/spec_topics/governance/source-language-stability.md line 9): an `E`
    // denies registration. At HEAD all four register — the bug document's
    // "registers: yes" column, and the reason a theta carrying a dead
    // error-model name runs — and under the route none does.
    const rows = [
      theta("a — `let a: Result<integer, Nope> = @`q``", 'let a: Result<integer, Nope> = @`q`\n"ok"'),
      theta("b — `let r = @<Result<integer, Nope>>`q``", 'let r = @<Result<integer, Nope>>`q`\n"ok"'),
      theta("c — `let a: Result<integer, nope> = @`q``", 'let a: Result<integer, nope> = @`q`\n"ok"'),
      theta("d — `let r = @<Result<integer, nope>>`q``", 'let r = @<Result<integer, nope>>`q`\n"ok"'),
    ];
    expectCaptured(rows, []);
    expect(
      rows.map((r) => [r.label, r.doc.diagnostics.map((d: Diagnostic) => d.severity)]),
      `${UNRESOLVED} is an E row, so its emission must be error-severity at this capture too`,
    ).toEqual(rows.map((r) => [r.label, ["error"]]));
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "a refused document is not registered",
    ).toEqual(rows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (both) One head written in BOTH argument slots of one annotation.
// ===========================================================================

describe("b0273 (both) — a head spelled in both `Result` slots of one annotation draws one refusal", () => {
  it("b0273-both: `Result<Nope, Nope>` draws exactly one line at both query routes and at the `fn` return", () => {
    // §Fix's emission pin: an `E`-side name adds one diagnostic for one written
    // name, not a second diagnostic for a name already reported. The two
    // argument slots are walked by two separate `collectUnresolvedNamedTypes`
    // calls and that function dedupes only within one call, so the head spelled
    // in both slots is the shape that would draw two byte-identical lines at
    // one range.
    //
    // THE PARITY IS THE ASSERTION. The `fn` return sibling resolves the whole
    // annotation text in a SINGLE call, so it renders `Result<Nope, Nope>` as
    // one line; the two query routes are asserted against that same value, so
    // the cell reds on the asymmetry this bug exists to close rather than on a
    // count chosen here.
    const rows = [
      theta("both-p — `let a: Result<Nope, Nope> = @`q`` (propagated)", 'let a: Result<Nope, Nope> = @`q`\n"ok"'),
      theta("both-w — `let r = @<Result<Nope, Nope>>`q`` (author-written)", 'let r = @<Result<Nope, Nope>>`q`\n"ok"'),
      theta("both-fn — `fn f(): Result<Nope, Nope> { Ok(1) }` (sibling capture)", 'fn f(): Result<Nope, Nope> { Ok(1) }\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [UNRESOLVED]),
      () => rows.map(() => [unresolvedLine("Nope")]),
    );
    expect(
      rows.map((r) => [r.label, r.codes.length]),
      "one written name draws one diagnostic at every capture, so the query routes must match the `fn` return sibling's count of one",
    ).toEqual(rows.map((r) => [r.label, 1]));
  });

  it("b0273-both-distinct: two DIFFERENT undeclared heads in the two slots draw one line each", () => {
    // The anti-over-broad half. Suppressing an `E`-side name already reported
    // for the same annotation must not suppress a name the response side never
    // reported: `Result<Nope, Gone>` writes two names and draws two refusals,
    // in written order, at both query routes and at the `fn` return sibling.
    const rows = [
      theta("distinct-p — `let a: Result<Nope, Gone> = @`q`` (propagated)", 'let a: Result<Nope, Gone> = @`q`\n"ok"'),
      theta("distinct-w — `let r = @<Result<Nope, Gone>>`q`` (author-written)", 'let r = @<Result<Nope, Gone>>`q`\n"ok"'),
      theta("distinct-fn — `fn f(): Result<Nope, Gone> { Ok(1) }` (sibling capture)", 'fn f(): Result<Nope, Gone> { Ok(1) }\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [UNRESOLVED, UNRESOLVED]),
      () => rows.map(() => [unresolvedLine("Nope"), unresolvedLine("Gone")]),
    );
  });
});

// ===========================================================================
// (count) One written annotation, one refusal, AT THE QUERY.
// ===========================================================================

describe("b0273 (count) — the propagated row draws EXACTLY ONE diagnostic, at the query", () => {
  it("b0273-count: row a's count stays at one and the line sits at the query, not the `let`", () => {
    // §Non-goals: this bug raises the query arm's coverage from one argument to
    // two, not the emission count from one to two. Bug 0262 §Fix clause (iv)(2)
    // withholds the `let` capture's own resolution of the propagated text
    // (`schemaFromLetAnnotation`) and bug 0093's per-query rule leaves the arm
    // firing once per query it walks, so the one written annotation must draw
    // one line.
    //
    // WHY THE POSITION IS ASSERTED BESIDE THE COUNT. A count of one is also
    // what a route would show that dropped the withhold and let the `let`
    // capture emit while the query arm stayed silent — a different disposition
    // with the same cardinality, and one that would red bug 0262's group (D2).
    // The `let` statement starts at source line 6 column 1 and the query at
    // column 32 (the five frontmatter lines and one blank precede the body, and
    // `let a: Result<integer, Nope> = ` is 31 characters), so the column reads
    // directly which capture spoke. Row j below, already drawing at HEAD for
    // its `T`-side head, is the measured precedent for the query-range
    // convention this expectation follows.
    const row = theta(
      "count — `let a: Result<integer, Nope> = @`q``",
      'let a: Result<integer, Nope> = @`q`\n"ok"',
    );
    expectCaptured([row], []);
    expect(
      [[row.label, row.codes.length]],
      "one written annotation draws one refusal: bug 0093's per-query rule and bug 0262 §Fix clause (iv)(2)'s withhold both hold, so the count must not rise to two",
    ).toEqual([[row.label, 1]]);
    expect(
      [[row.label, startPositions(row)]],
      "the query arm is the propagated text's sole emitter, so the one line sits at the query (column 32), never at the `let` statement's own column 1",
    ).toEqual([[row.label, ["6:32"]]]);
  });
});

// ===========================================================================
// (asym) Rows e through i — the same `E`-side head at every other capture.
// ===========================================================================

describe("b0273 (asym) — the `fn` return, `fn` parameter and non-query `let` captures already refuse", () => {
  it("b0273-asym: the identical `E`-side head refuses at r8, the parameter, and a non-query `let`", () => {
    // THE PINNED FACE OF THIS WITNESS. These five cells are green at HEAD and
    // must stay green: they are the other half of the asymmetry group (E)
    // reds on. `walkStatement`'s `fn` return capture routes the WHOLE
    // annotation text through `collectUnresolvedNamedTypes` with no peel (bug
    // 0262's r8), and so do its parameter and `let` captures, which is why
    // fixture e refuses where fixture a does not. Moving the identical
    // annotation from an `fn` return to a query initialiser must stop turning a
    // refusal into silence, and it must not do so by silencing these.
    //
    // Row g is the `T`-side twin at the same `fn` return capture: it fixes that
    // the capture refuses either argument, so the delta group (E) measures is
    // the CAPTURE, not the argument slot.
    const rows = [
      theta("e — `fn f(): Result<integer, Nope>` (r8, `E` side)", 'fn f(): Result<integer, Nope> { Ok(1) }\n"ok"'),
      theta("f — `fn f(): Result<integer, nope>`", 'fn f(): Result<integer, nope> { Ok(1) }\n"ok"'),
      theta("g — `fn f(): Result<Nope, string>` (r8, `T` side)", 'fn f(): Result<Nope, string> { Ok(1) }\n"ok"'),
      theta(
        "h — `fn f(x: Result<integer, Nope>)` (parameter)",
        'fn f(x: Result<integer, Nope>): number { 1 }\nlet r = f(Ok(1))\n"ok"',
      ),
      theta("i — `let a: Result<integer, Nope> = Ok(1)` (non-query `let`)", 'let a: Result<integer, Nope> = Ok(1)\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [UNRESOLVED]),
      () => [
        [unresolvedLine("Nope")],
        [unresolvedLine("nope")],
        [unresolvedLine("Nope")],
        [unresolvedLine("Nope")],
        [unresolvedLine("Nope")],
      ],
    );
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "these five captures already refuse an error, so none of them registers before or after",
    ).toEqual(rows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (T) Rows j and k — the `T` side, byte-stable.
// ===========================================================================

describe("b0273 (T) — the `T`-side head at the query capture is byte-stable", () => {
  it("b0273-T: both `T`-side spellings keep exactly one refusal at the query's own position", () => {
    // §Non-goals: the `T`-side behaviour is correct and byte-stable. `T` is
    // what `queryResponseAnnotation` already returns, so these two cells are
    // the control against a route that reorganised the peel and moved the
    // argument it hands the arm. The positions are measured: the propagated
    // spelling's line sits at the query (source line 6 column 35 — `let a:
    // Result<Nope, QueryError> = ` is 34 characters) and the written
    // ascription's at column 9, and both are what fixes that a `T`-side
    // refusal already comes from the query arm rather than from the `let`
    // capture.
    const rows = [
      theta("j — `let a: Result<Nope, QueryError> = @`q`` (propagated)", 'let a: Result<Nope, QueryError> = @`q`\n"ok"'),
      theta("k — `let r = @<Result<Nope, QueryError>>`q`` (written)", 'let r = @<Result<Nope, QueryError>>`q`\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [UNRESOLVED]),
      () => [[unresolvedLine("Nope")], [unresolvedLine("Nope")]],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the query arm is the emitter for the `T` side at both routes, so each line sits at its own query expression",
    ).toEqual([
      [rows[0]?.label, ["6:35"]],
      [rows[1]?.label, ["6:9"]],
    ]);
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "the `T`-side refusal is error-severity, so neither fixture registers",
    ).toEqual(rows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (neg) Rows l and m — the declared head and the builtin stay silent.
// ===========================================================================

describe("b0273 (neg) — a declared `E` head and the builtin `QueryError` are admitted", () => {
  it("b0273-neg: both keep an empty diagnostic list and keep registering", () => {
    // The peel's stated purpose, and the negative controls the §Non-goals name.
    // Row m is the shape QRY-1 puts on every query's declared value type, and
    // the shape the shipped `docs/examples/personas.thetalib` spells at an `fn`
    // return — a route that read `QueryError` as an ordinary `NamedType` would
    // refuse that committed fixture and red
    // `tests/committed-fixture-parse-gate.test.ts`. Row l is the anti-vacuity
    // half of group (E): the ONLY delta from row a is a declaration of the
    // name, and the list must stay empty, so group (E)'s refusal is a
    // resolution verdict and not something the fixture would draw regardless.
    const declared = theta(
      "l — `schema Nope { a: number }` + `let a: Result<integer, Nope> = @`q``",
      'schema Nope { a: number }\nlet a: Result<integer, Nope> = @`q`\n"ok"',
    );
    const builtin = theta(
      "m — `let a: Result<integer, QueryError> = @`q``",
      'let a: Result<integer, QueryError> = @`q`\n"ok"',
    );
    expectCaptured([declared], ["Nope"]);
    expectCaptured([builtin], []);
    expectRows([declared, builtin], [[], []], () => [[], []]);
    expect(
      [declared, builtin].map((r) => [r.label, registered(r)]),
      "a declared `E` head and the builtin error-model name both keep the theta registered",
    ).toEqual([declared, builtin].map((r) => [r.label, true]));
  });
});

// ===========================================================================
// (arity) The non-arity-2 path keeps its interior.
// ===========================================================================

describe("b0273 (arity) — a `Result` application of a count other than two is untouched", () => {
  it("b0273-arity: the written and the propagated non-arity-2 spellings keep their measured lists", () => {
    // §Non-goals: `queryResponseAnnotation`'s non-arity-2 path is bug 0204 §Fix
    // (b)(3) and bug 0236's recorded residual, and the `E`-side resolution runs
    // on the arity-2 path alone. These four cells assert the disposition
    // MEASURED at HEAD, so they red on a route that widened the peel instead of
    // adding beside it:
    //
    //   arity-w1 / arity-w3 — an AUTHOR-WRITTEN ascription of one and of three
    //   arguments. `queryResponseAnnotation` returns `undefined`, the arm
    //   descends nothing, and no capture behind it holds the text, so both are
    //   silent and register. arity-w3 additionally carries the undeclared
    //   `Nope` in a non-`T` argument: the arity-2 path is the only one the
    //   change reaches, so that head stays undescended and this cell reds if
    //   the new resolution ran on a count the peel declined.
    //
    //   arity-p1 / arity-p3 — the same two counts PROPAGATED from a `let`
    //   annotation. The `let` statement's own type walk draws the arity verdict
    //   at column 1, and the query arm adds nothing, so
    //   `theta/parse/generic-arity-mismatch` keeps its interior exactly as the
    //   §Fix requires.
    const written = [
      theta("arity-w1 — `let r = @<Result<integer>>`q``", 'let r = @<Result<integer>>`q`\n"ok"'),
      theta("arity-w3 — `let r = @<Result<integer, Nope, string>>`q``", 'let r = @<Result<integer, Nope, string>>`q`\n"ok"'),
    ];
    const propagated = [
      theta("arity-p1 — `let a: Result<integer> = @`q``", 'let a: Result<integer> = @`q`\n"ok"'),
      theta("arity-p3 — `let a: Result<integer, Nope, string> = @`q``", 'let a: Result<integer, Nope, string> = @`q`\n"ok"'),
    ];
    expectCaptured([...written, ...propagated], []);
    expectRows(
      [...written, ...propagated],
      [[], [], [ARITY], [ARITY]],
      () => [[], [], [arityLine("1")], [arityLine("3")]],
    );
    expect(
      propagated.map((r) => [r.label, startPositions(r)]),
      "the arity verdict is the `let` statement's own walk speaking at column 1, and the query arm adds no line beside it",
    ).toEqual(propagated.map((r) => [r.label, ["6:1"]]));
    expect(
      [...written, ...propagated].map((r) => [r.label, registered(r)]),
      "the written non-arity-2 spellings draw nothing and register; the propagated ones carry an error and do not",
    ).toEqual([
      [written[0]?.label, true],
      [written[1]?.label, true],
      [propagated[0]?.label, false],
      [propagated[1]?.label, false],
    ]);
  });
});

// ===========================================================================
// (DIAG-2) The registry rows this file asserts against exist and are closed.
// ===========================================================================

describe("b0273 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0273-DIAG-2: both codes carry an E/parse row and a placeholder-bearing Message", () => {
    // DIAG-2: the registry is closed, so a code a test asserts must have a row
    // (`reconcileClosedSet`, `tools/code-registry/index.js`). Neither code is
    // new here — the row at
    // docs/spec_topics/diagnostics/code-registry-parse.md line 112 already names every
    // `Result` argument nested inside the `@<T>` query annotation as this
    // code's trigger, which is why the §Fix widens no row and moves no
    // *Message* byte. This cell fails loudly on the unmet precondition rather
    // than letting `msg` above substitute into an absent template.
    const rows = [UNRESOLVED, ARITY].map((code) => {
      const row = REGISTRY.find((r) => r.code === code);
      return [code, row?.severity, row?.phase] as const;
    });
    expect(
      rows,
      `DIAG-2: ${REGISTRY_PATH} must carry a closed-set row for each asserted code`,
    ).toEqual([
      [UNRESOLVED, "E", "parse"],
      [ARITY, "E", "parse"],
    ]);
    expect(
      msg(UNRESOLVED, [["<name>", "Nope"]]),
      "the refusal's rendered Message must carry the head it names",
    ).toContain("Nope");
    expect(
      arityLine("3"),
      "the arity verdict's rendered Message must carry the constructor and the counts it names",
    ).toContain("Result");
  });
});
