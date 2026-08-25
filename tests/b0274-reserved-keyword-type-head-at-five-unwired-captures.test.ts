import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0274 — a reserved-keyword spelling written where a `NamedType` is read
// draws nothing at five of the eight `collectUnresolvedNamedTypes` call sites
// (docs/bugs/0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md).
//
// THE SEAM. `collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts`)
// walks a captured type text and separates two classes: names that resolve to
// no declaration, RETURNED; and reserved spellings read where a `NamedType` is
// read, published only through the OPTIONAL caller-owned `reservedKeywords`
// out-parameter. The separation is bug 0044's — a reserved spelling is not an
// `Ident` (docs/spec_topics/lexical.md line 20) so it is not a `NamedType`
// (docs/spec_topics/grammar.md line 98) and cannot travel in a list of
// unresolved names. Three call sites in `src/parser/theta-document.ts` pass the
// sink (the `schema X = …` alias/union right-hand side, the `schema` body field
// type, and the `@<T>` query capture's RESPONSE part), and the `params:`
// right-hand side reaches it through its own lowering
// (`src/parser/params.ts`) — four emitting callers, the number that sink's own
// comment names. Five pass none, so at those five the class is computed and
// discarded: the `let` annotation, the `fn` parameter type, the `fn` return
// type, the `invoke<Type>` ascription, and the `E`-side block bug 0273 landed
// at the query capture.
//
// THE SETTLED TARGET BEHAVIOUR THIS FILE ENCODES (the bug document's §Expected
// behaviour and §Fix route (a), taken A-SCOPED at all five sites). Each of the
// five sites gains a `reservedKeywords` out-parameter and emits
// `reservedKeywordAsIdentifierDiagnostic` per hit at the range that site's
// sibling `unresolvedNamedTypeDiagnostic` call already passes, mirroring the
// response part's shape. No code is minted — `theta/parse/reserved-keyword-as-identifier`
// is an existing row whose *Trigger* enumerates no position — and no *Message*
// byte moves. An error-severity `theta/parse/*` diagnostic denies registration,
// the GOV-15 loads-cleanly reading
// (docs/spec_topics/governance/source-language-stability.md line 9).
//
// THE ADMITTED SET AT THE FIVE NEW SITES IS SCOPED, AND GROUP (X) IS THAT
// SCOPE'S LOAD-BEARING LOCK. `reservedKeywords()` (`src/lexer/lexer.ts`) holds
// 32 spellings. Five of them — `string`, `number`, `integer`, `boolean`,
// `null` — are taken by the `PRIMITIVE_TYPES` test in `lowerTypeExpr`'s atom
// arm (`src/parser/params.ts`) BEFORE the reserved branch, so they never reach
// the sink at all; `true`, `false` and `void` are dispositioned inside the
// reserved branch and never pushed. Of the 24 that do reach it, four are
// withheld at the five NEW sites and only there:
//
//   `Result` and `array` are LEGAL TYPE HEADS. docs/spec_topics/grammar.md
//   lines 99 and 100 read `GenericType ::= "array" "<" Type ">" | "Result"
//   "<" Type "," Type ">"`, the prose at line 107 states that both constructor
//   heads are reserved keywords and are nonetheless reachable in type
//   position, and docs/spec_topics/lexical.md line 20 says the same from the
//   lexical side. `fn step(): Result { … }` is legal source the production
//   conformance suite drives (`tests/conformance/production-conformance.test.ts`,
//   V20g-T), so a sink that admitted `Result` at the `fn` return site would
//   refuse legal source.
//
//   `Ok` and `Err` are `Result`'s own value constructors and are withheld by
//   the same conservative enumeration, so no route from a constructor spelling
//   to a refusal is opened at these sites by this change.
//
// Twenty spellings are therefore admitted at the five new sites. The four
// ALREADY-WIRED callers are untouched: `let r = @<Result>`q`` refuses today and
// keeps refusing, which is why group (X)'s withholds are stated as a property
// of the FIVE NEW SITES and not of the sink.
//
// Coordination note, 0.275.0: the four paragraphs above describe the withhold as
// bug 0274 §Fix route (a) landed it and are left standing as the historical
// record. Bug 0277 §Fix route (a)
// (../docs/bugs/0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md)
// measured that the withhold protects no APPLIED `Result<…>` / `array<…>` —
// neither ever reaches the atom arm the withhold guards — so it withholds only
// the UNAPPLIED, zero-argument spelling, which no `Type` production derives
// (`GenericType`'s two alternatives each spell their own `"<" … ">"`,
// grammar.md:99–:100). Route (a) there removes the withhold entirely; group
// (X) below is restated accordingly rather than deleted, following the
// discipline group (E10) above already models for its own bug-0278
// restatement.
//
// WHAT IS RED HERE AND WHY. Group (E/F) — the bug document's §Reproduction rows
// E1 through E7 and F1 through F8, each at BOTH measured spellings — asserts one
// refusal where the parser at HEAD produces an EMPTY diagnostic list, so each
// red reads "expected [theta/parse/reserved-keyword-as-identifier], received
// []". Group (E8) is red on the SECOND line only (the `Nope` line already
// stands at HEAD), and two cells of group (count) are red on the count. Every
// other group is measured at HEAD and green there: group (T) carries rows
// T1–T4, group (C) rows C1–C5, group (E9) the one-line dedup and group (E10)
// the non-arity-2 path. Group (X) is measured and green at HEAD for THIS file
// in isolation, but eight of its thirteen rows flip under bug 0277 §Fix route
// (a) landing in the same tree (see the coordination note above) — restated,
// not deleted, per that report's own authorization.
//
// TWO SPELLINGS, AND WHY THESE TWO. `match` and `return` are members of neither
// `PRIMITIVE_TYPES` nor the lexer's `controlHeads` set (`src/lexer/lexer.ts`),
// whose contextual scan makes `fn`, `for`, `if` and `while` draw
// `theta/parse/single-line-if` at many of these positions — a misfire the bug
// document's §Non-goals leave alone and measure around. Those four spellings
// are therefore unusable as discriminators and appear in no fixture here.
//
// BOUNDS THIS FILE ALSO LOCKS, EACH FROM §Non-goals:
//
//   Emission count. One written keyword per annotation draws one line.
//   `collectUnresolvedNamedTypes` dedupes within ONE call
//   (`reservedKeywords?.push(...new Set(keywordHits))`), and the query
//   capture's two argument slots are TWO calls, so the `E`-side keyword loop
//   must filter against the response part's own hits exactly as bug 0273's
//   seen-set filters the name class. Group (count) reads the surviving line's
//   POSITION beside the count, because a count of one is also what a route
//   would show that emitted at the `let` capture while the query arm went
//   silent — bug 0262 §Fix clause (iv)(2) makes the query arm the propagated
//   text's sole emitter.
//
//   The non-arity-2 path. `queryErrorModelAnnotation` declines any argument
//   count other than two, so the `E`-side block is never reached and the
//   keyword head is presented to NO sink — that subject survives the fix
//   restated, not deleted: bug 0278 §Fix now feeds the WHOLE annotation to the
//   position-rule walk on this path, so `theta/parse/generic-arity-mismatch`
//   fires (from the application's own wrong arity) where nothing fired
//   before, but the `E`-side keyword loop this file's other groups exercise
//   still never runs for it. Group (E10) now asserts exactly one arity line
//   and no reserved-keyword line, and registration still denied — denied by
//   the arity refusal now, not the earlier clean load.
//
//   The already-emitting positions. Groups (T) and (C) are the keyword class's
//   existing emission sites — the query annotation's response part, the
//   `schema` body field type, bug 0249's inline-object key, the binder's lexer
//   site and bug 0153's enum variant name. Their codes, ranges and *Message*
//   bytes do not move.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (`tests/helpers/e2e-s1.ts` — the shipped whole-file entry point wrapped in
// inert deps, no behaviour stubbed). An integration tier would add a round trip
// to a value already fixed at the parse boundary and observe nothing sharper; a
// live tier cannot see a parse-time diagnostic list at all, only the
// registration outcome it implies, which the standalone live cell
// `tests/live/b0274live-reserved-keyword-type-head-registration.test.ts`
// covers. Registration is asserted here through the composition root's own
// predicate rather than a live load.
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
// diagnostic nor one at the wrong position can hide. `Nope` is declared and
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

/** The row the five newly-wired sinks emit; its *Message* does not move. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
/** Bug 0273's landed `E`-side row, which group (E8) keeps beside the new line. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
/**
 * Bug 0278 §Fix's row: what group (E10) now draws instead of silence for a
 * non-arity-2 `Result` application, ALONE — the fix that restates this cell's
 * subject does not wire the `E`-side keyword sink onto the non-arity-2 path,
 * it only makes the application's own wrong arity reportable.
 */
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

/** The keyword refusal, rendered for the spelling `keyword`. */
function reservedLine(keyword: string): string {
  return line(RESERVED, [["<keyword>", keyword]]);
}

/** Bug 0273's landed refusal, rendered for the head `name`. */
function unresolvedLine(name: string): string {
  return line(UNRESOLVED, [["<name>", name]]);
}

/** The arity refusal (bug 0278 §Fix), rendered for one constructor, its declared arity and the written count. */
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

/** The frontmatter every fixture carries, per the bug document's §Reproduction. */
const FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

/** A `mode: prompt` theta whose body is `body` verbatim, parsed once. */
function theta(label: string, body: string): LoadRow {
  const doc = parseDoc(`${FRONTMATTER}${body}\n`, "b0274.theta");
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
 * this bug wires emit at different ranges on one source line — the statement's
 * own start for the `let`, `fn` parameter and `fn` return sites, the
 * expression's start for the `invoke<Type>` and query sites — so the column is
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

// ===========================================================================
// The probed positions.
// ===========================================================================

/** One probed position: its fixture and its emission range, parameterised by the spelling. */
interface Position {
  readonly id: string;
  /** The fixture, verbatim from the bug document's §Reproduction tables. */
  readonly build: (keyword: string) => LoadRow;
  /**
   * The `line:column` the site emits at. Each is the range that site's sibling
   * `unresolvedNamedTypeDiagnostic` call already passes, taken from the cell of
   * `tests/b0262-unresolved-named-type-reference-positions.test.ts` or
   * `tests/b0273-query-result-error-side-unresolved-name.test.ts` that measured
   * it — see each position's own note.
   */
  readonly at: (keyword: string) => string;
}

/**
 * The propagated `let`-annotation prefix, whose length fixes the query
 * expression's column: bug 0262 §Fix clause (iv)(2) makes the query arm the
 * propagated text's sole emitter, so the line sits at the initialiser's `@`,
 * one past this prefix. Bug 0273's group (count) cell measured the same
 * arithmetic at its own head spelling.
 */
function propagatedPrefix(keyword: string): string {
  return `let a: Result<integer, ${keyword}> = `;
}

/**
 * Rows E1 through E7 and F1 through F8 — the thirteen fixtures whose keyword
 * head is silent at HEAD. The two query-capture columns come from bug 0273's
 * groups (T) and (count); the `let` / `fn` columns from bug 0262's groups (D6)
 * and (D8), where the `let` capture speaks at the statement's own start
 * (column 1) and an `fn` capture at the whole declaration's start (column 1);
 * the `invoke<Type>` column from bug 0262's group (D8) cell D8c, where the
 * ascription speaks at the `invoke` expression's own start.
 */
const SILENT_POSITIONS: readonly Position[] = [
  {
    // Rows E1 / E2 — the author-written `@<Result<T, E>>` ascription.
    id: "E1/E2 — query `E` argument, written ascription",
    build: (k) => theta(`E1/E2 (${k})`, `let r = @<Result<integer, ${k}>>\`q\`\n"ok"`),
    at: () => "6:9",
  },
  {
    // Rows E3 / E4 — the propagated route: `parseLet` writes the annotation
    // verbatim onto a bare-query initialiser and the `let` capture withholds.
    id: "E3/E4 — query `E` argument, propagated annotation",
    build: (k) => theta(`E3/E4 (${k})`, `${propagatedPrefix(k)}@\`q\`\n"ok"`),
    at: (k) => `6:${propagatedPrefix(k).length + 1}`,
  },
  {
    id: "E5 — query `E` argument, inside `array<…>`",
    build: (k) => theta(`E5 (${k})`, `let r = @<Result<integer, array<${k}>>>\`q\`\n"ok"`),
    at: () => "6:9",
  },
  {
    id: "E6 — query `E` argument, union arm",
    build: (k) => theta(`E6 (${k})`, `let r = @<Result<integer, ${k} | integer>>\`q\`\n"ok"`),
    at: () => "6:9",
  },
  {
    id: "E7 — query `E` argument, inline object field type",
    build: (k) => theta(`E7 (${k})`, `let r = @<Result<integer, { x: ${k} }>>\`q\`\n"ok"`),
    at: () => "6:9",
  },
  {
    id: "F1 — `fn` return type, `Result` `T` argument",
    build: (k) => theta(`F1 (${k})`, `fn f(): Result<${k}, integer> { Ok(1) }\n"ok"`),
    at: () => "6:1",
  },
  {
    id: "F2 — `fn` return type, `Result` `E` argument",
    build: (k) => theta(`F2 (${k})`, `fn g(): Result<integer, ${k}> { Ok(1) }\n"ok"`),
    at: () => "6:1",
  },
  {
    id: "F3 — `fn` return type, bare head",
    build: (k) => theta(`F3 (${k})`, `fn f(): ${k} { 1 }\n"ok"`),
    at: () => "6:1",
  },
  {
    id: "F4 — `fn` parameter type, `Result` `E` argument",
    build: (k) =>
      theta(`F4 (${k})`, `fn h(x: Result<integer, ${k}>): number { 1 }\nlet r = h(Ok(1))\n"ok"`),
    at: () => "6:1",
  },
  {
    id: "F5 — `let` annotation, bare head",
    build: (k) => theta(`F5 (${k})`, `let a: ${k} = 3\n"ok"`),
    at: () => "6:1",
  },
  {
    id: "F6 — `let` annotation, `Result` `E` argument, non-query initialiser",
    build: (k) => theta(`F6 (${k})`, `let a: Result<integer, ${k}> = Ok(1)\n"ok"`),
    at: () => "6:1",
  },
  {
    id: "F7 — `invoke<Type>` ascription, `Result` `E` argument",
    build: (k) =>
      theta(`F7 (${k})`, `let r = invoke<Result<integer, ${k}>>("./x.theta", "hi")\n"ok"`),
    at: () => "6:9",
  },
  {
    id: "F8 — `invoke<Type>` ascription, bare head",
    build: (k) => theta(`F8 (${k})`, `let r = invoke<${k}>("./x.theta", "hi")\n"ok"`),
    at: () => "6:9",
  },
];

/**
 * The two spellings every position is probed at. Both are reserved
 * (`reservedKeywords()`, `src/lexer/lexer.ts`), neither is in
 * `PRIMITIVE_TYPES` nor in the lexer's `controlHeads` set, so neither is
 * confounded by the `theta/parse/single-line-if` misfire the §Non-goals leave
 * alone.
 */
const SPELLINGS = ["match", "return"] as const;

/** Every (position, spelling) pair, in table order. */
function cells(positions: readonly Position[]): {
  row: LoadRow;
  keyword: string;
  at: string;
}[] {
  return positions.flatMap((p) =>
    SPELLINGS.map((keyword) => ({ row: p.build(keyword), keyword, at: p.at(keyword) })),
  );
}

// ===========================================================================
// (E/F) Rows E1–E7 and F1–F8 — the five unwired sites refuse a keyword head.
// ===========================================================================

describe("b0274 (E/F) — a written reserved head at the five sinkless captures is refused", () => {
  it("b0274-EF: each of the thirteen silent positions draws exactly one keyword refusal at both spellings", () => {
    // The heart of the report, and the largest red group. At HEAD each of these
    // twenty-six diagnostic lists is EMPTY: the keyword class is computed at
    // every one of these captures and published nowhere, because the caller
    // passes no `reservedKeywords` sink. Under the settled route each site
    // allocates one and emits per hit, so a spelling
    // docs/spec_topics/lexical.md line 20 bars from identifier position stops
    // being accepted at a type-name position.
    const probes = cells(SILENT_POSITIONS);
    expectCaptured(
      probes.map((c) => c.row),
      [],
    );
    expectRows(
      probes.map((c) => c.row),
      probes.map(() => [RESERVED]),
      () => probes.map((c) => [reservedLine(c.keyword)]),
    );
  });

  it("b0274-EF-position: each refusal sits at the range its site's sibling name refusal already uses", () => {
    // §Fix route (a) fixes the range rather than choosing one: each site emits
    // at the range its own `unresolvedNamedTypeDiagnostic` call already passes.
    // The columns separate the captures on one source line, so this cell reds
    // on a route that emitted the right code from the wrong capture — the `let`
    // and `fn` sites at the statement's own start, the `invoke<Type>` and query
    // sites at their expression's start.
    const probes = cells(SILENT_POSITIONS);
    expect(
      probes.map((c) => [c.row.label, startPositions(c.row)]),
      "each site's keyword refusal shares the range of that site's own name refusal",
    ).toEqual(probes.map((c) => [c.row.label, [c.at]]));
  });

  it("b0274-EF-registration: an error-severity keyword refusal denies registration at all thirteen positions", () => {
    // The GOV-15 loads-cleanly reading
    // (docs/spec_topics/governance/source-language-stability.md line 9): an `E`
    // denies registration. At HEAD all twenty-six register — the bug document's
    // "registers: yes" column, and the reason a theta carrying a reserved
    // spelling where a declaration name belongs runs — and under the route none
    // does.
    const probes = cells(SILENT_POSITIONS);
    expectCaptured(
      probes.map((c) => c.row),
      [],
    );
    expect(
      probes.map((c) => [c.row.label, c.row.doc.diagnostics.map((d: Diagnostic) => d.severity)]),
      `${RESERVED} is an E row, so its emission must be error-severity at every position`,
    ).toEqual(probes.map((c) => [c.row.label, ["error"]]));
    expect(
      probes.map((c) => [c.row.label, registered(c.row)]),
      "a refused document is not registered",
    ).toEqual(probes.map((c) => [c.row.label, false]));
  });
});

// ===========================================================================
// (E8) Two written mistakes in one `E` argument draw two diagnostics.
// ===========================================================================

describe("b0274 (E8) — a keyword beside an undeclared name in the `E` argument draws both lines", () => {
  it("b0274-E8: the keyword line stands beside bug 0273's landed name line", () => {
    // The bug document's sharp cell. ONE walk over the `E` text already reports
    // the undeclared `Nope` at HEAD and drops the keyword written beside it, so
    // the silence is the missing sink and not an unvisited slot. Two written
    // mistakes draw two diagnostics: bug 0273's landed name line is untouched
    // (its §Non-goals hold that walk and its count) and the keyword line is
    // added.
    //
    // THE ORDER IS DERIVED, NOT CHOSEN. §Fix route (a) mirrors the response
    // part's shape verbatim, and there the keyword loop runs BEFORE the
    // unresolved-name loop, so the keyword line precedes the name line within
    // the `E` block too.
    const rows = SPELLINGS.map((k) =>
      theta(`E8 (${k}) — \`@<Result<integer, ${k} | Nope>>\``, `let r = @<Result<integer, ${k} | Nope>>\`q\`\n"ok"`),
    );
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [RESERVED, UNRESOLVED]),
      () => SPELLINGS.map((k) => [reservedLine(k), unresolvedLine("Nope")]),
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "both lines are the query arm speaking about one annotation, so both sit at the query expression's own start",
    ).toEqual(rows.map((r) => [r.label, ["6:9", "6:9"]]));
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "two error-severity refusals deny registration",
    ).toEqual(rows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (E9) One spelling in BOTH slots of one annotation draws ONE line.
// ===========================================================================

describe("b0274 (E9) — a keyword spelled in both `Result` slots draws exactly one refusal", () => {
  it("b0274-E9: `Result<match, match>` and `Result<return, return>` keep their single HEAD line", () => {
    // Green at HEAD — the line comes from the RESPONSE part's already-wired
    // sink, reading the `T` side — and green under the route, which is the
    // assertion. The two argument slots are two `collectUnresolvedNamedTypes`
    // calls and that function dedupes only within one call, so the `E`-side
    // keyword loop must filter against the response part's own hits exactly as
    // bug 0273's seen-set filters the name class. Without that filter this cell
    // reds with two byte-identical lines at one range.
    const rows = SPELLINGS.map((k) =>
      theta(`E9 (${k}) — \`@<Result<${k}, ${k}>>\``, `let r = @<Result<${k}, ${k}>>\`q\`\n"ok"`),
    );
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [RESERVED]),
      () => SPELLINGS.map((k) => [reservedLine(k)]),
    );
    expect(
      rows.map((r) => [r.label, r.codes.length]),
      "one spelling written twice in one annotation draws one line, matching the response side's own dedup",
    ).toEqual(rows.map((r) => [r.label, 1]));
  });
});

// ===========================================================================
// (E10) The non-arity-2 path descends nothing.
// ===========================================================================

describe("b0274 (E10) — a `Result` application of a count other than two presents its keyword head to no sink", () => {
  it("b0274-E10: the arity-3 ascription draws the arity line alone, with no keyword line, and does not register", () => {
    // RESTATED under bug 0278 §Fix, not deleted (bug 0278 §Fix authorises this
    // flip only with the subject restated in the same change): before that fix
    // `queryResponseAnnotation` / `queryErrorModelAnnotation` both declined this
    // count, so the whole `"query"` arm block — including the `E`-side keyword
    // loop — never ran, and the cell measured a clean, silent load. Bug 0278
    // §Fix feeds the WHOLE annotation to the position-rule walk on exactly this
    // path, so the application's own wrong arity is now reported —
    // `theta/parse/generic-arity-mismatch`, from `type-grammar.ts`'s existing
    // arity mint, reduced at the call site to that one diagnostic (bug 0278
    // §Fix constraint 1). The SUBJECT this cell measures is unchanged: the
    // `E`-side block bug 0273 landed, and the keyword-collection sink it
    // carries, still never runs on this path — the keyword head is presented
    // to NO sink, so no `theta/parse/reserved-keyword-as-identifier` line ever
    // joins the arity line. A route that widened the peel to reach the keyword
    // sink instead of walking the whole annotation for its arity verdict reds
    // here with a second line.
    const rows = SPELLINGS.map((k) =>
      theta(`E10 (${k}) — \`@<Result<integer, ${k}, string>>\``, `let r = @<Result<integer, ${k}, string>>\`q\`\n"ok"`),
    );
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [ARITY]),
      () => rows.map(() => [arityLine("Result", 2, 3)]),
    );
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "the arity refusal denies registration; the keyword head still reaches no sink",
    ).toEqual(rows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (X) The four spellings the five NEW sites withhold — the scoping lock.
// ===========================================================================

describe("b0274 (X) — the withheld set's own scoping, restated under bug 0277 §Fix route (a)", () => {
  it("b0274-X: the eight UNAPPLIED-head rows now refuse; the five APPLIED/primitive rows are unmoved", () => {
    // RESTATED under bug 0277 §Fix route (a), not deleted (bug 0277 §Fix names
    // this exact group and requires the coordination note this comment is,
    // following the discipline b0274-E10 above already models for its own
    // bug-0278 restatement): `admittedReservedKeywords` and
    // `WITHHELD_TYPE_HEAD_KEYWORDS` (`src/parser/theta-document.ts`) are gone,
    // so the five newly-wired sinks this group locked now render every hit
    // directly, exactly as the four already-unfiltered captures always have.
    //
    // THE SUBJECT THIS GROUP STILL MEASURES is unchanged: which of the sink's
    // hits ever REACH one of the five sites at all. That question splits the
    // original thirteen rows in two, and route (a) does not touch the split
    // itself — only which of the two answers now draws a diagnostic.
    //
    //   EIGHT ROWS write an UNAPPLIED `Result` / `array` / `Ok` / `Err` — no
    //   argument list — which reaches `lowerTypeExpr`'s atom arm
    //   (`src/parser/params.ts`) precisely because it carries none.
    //   Bug 0277 §Fix's own reading is that no `Type` production derives that
    //   shape (`GenericType`'s two alternatives each spell their own
    //   `"<" … ">"`, grammar.md:99–:100), so the atom arm's classification —
    //   a reserved keyword read where an `Ident` is read — is now rendered
    //   here as everywhere else: X1, X2, X5, X6, X7, X8, X10, X11.
    //   `fn step(): Result { … }` (X5) is the UNAPPLIED shape
    //   `tests/conformance/production-conformance.test.ts`'s V20g-T cell used
    //   to drive — respelled to the APPLIED `Result<integer, QueryError>` in
    //   the same change (bug 0277 §Fix §1) — so this row's new refusal does
    //   not reopen that cell.
    //
    //   FIVE ROWS never reach the atom arm at all, and are unmoved: X3 and X12
    //   (`null`, a `PrimitiveType` tested before the reserved branch), X4 (a
    //   primitive union arm, same ground), and X9 and X13 (an APPLIED
    //   `array<integer>`, consumed structurally by the generic-application arm
    //   — §Non-goals: "The APPLIED heads stay admitted everywhere the grammar
    //   admits them").
    const flipped = [
      theta("X1 — `let a: Result = Ok(1)` (`let` site, unapplied head)", "let a: Result = Ok(1)\n\"ok\""),
      theta("X2 — `let a: array = 3` (`let` site, unapplied head)", "let a: array = 3\n\"ok\""),
      theta("X5 — `fn step(): Result { Ok(1) }` (`fn` return site, unapplied head)", "fn step(): Result { Ok(1) }\n\"ok\""),
      theta("X6 — `fn s(): array { 3 }` (`fn` return site, unapplied head)", "fn s(): array { 3 }\n\"ok\""),
      theta("X7 — `fn s(p: array): number { 1 }` (`fn` parameter site, unapplied head)", 'fn s(p: array): number { 1 }\nlet r = s([1])\n"ok"'),
      theta("X8 — `invoke<Result>` (ascription site, unapplied head)", 'let r = invoke<Result>("./x.theta", "hi")\n"ok"'),
      theta("X10 — `@<Result<integer, Ok>>` (query `E` site, unapplied value constructor)", 'let r = @<Result<integer, Ok>>`q`\n"ok"'),
      theta("X11 — `@<Result<integer, Err>>` (query `E` site, unapplied value constructor)", 'let r = @<Result<integer, Err>>`q`\n"ok"'),
    ];
    const flippedKeywords = ["Result", "array", "Result", "array", "array", "Result", "Ok", "Err"];
    expectCaptured(flipped, []);
    expectRows(
      flipped,
      flipped.map(() => [RESERVED]),
      () => flippedKeywords.map((k) => [reservedLine(k)]),
    );
    expect(
      flipped.map((r) => [r.label, registered(r)]),
      "every unapplied head now denies registration at the five newly-wired sites",
    ).toEqual(flipped.map((r) => [r.label, false]));

    const unmoved = [
      theta("X3 — `let a: null = null` (`let` site, primitive)", "let a: null = null\n\"ok\""),
      theta("X4 — `let a: string | null = null` (`let` site, primitive union arm)", "let a: string | null = null\n\"ok\""),
      theta("X9 — `invoke<array<integer>>` (ascription site, applied head)", 'let r = invoke<array<integer>>("./x.theta", "hi")\n"ok"'),
      theta("X12 — `@<Result<integer, null>>` (query `E` site, primitive)", 'let r = @<Result<integer, null>>`q`\n"ok"'),
      theta("X13 — `@<Result<integer, array<integer>>>` (query `E` site, applied head)", 'let r = @<Result<integer, array<integer>>>`q`\n"ok"'),
    ];
    expectCaptured(unmoved, []);
    expectRows(
      unmoved,
      unmoved.map(() => []),
      () => unmoved.map(() => []),
    );
    expect(
      unmoved.map((r) => [r.label, registered(r)]),
      "a primitive or an applied head never reaches the atom arm, so it keeps registering unmoved",
    ).toEqual(unmoved.map((r) => [r.label, true]));
  });
});

// ===========================================================================
// (T) Rows T1–T4 — the query capture's `T` argument, byte-stable.
// ===========================================================================

describe("b0274 (T) — the response part's already-wired sink is unmoved", () => {
  it("b0274-T: rows T1 through T4 keep exactly one refusal at their measured ranges", () => {
    // Green at HEAD, and the control against a route that reorganised the
    // response part while adding the `E`-side sink. `queryResponseAnnotation`
    // peels the application down to `T` and the response part's own sink emits
    // from it, which is why the `T` side already refuses. T3 is the propagated
    // route at the `T` side: bug 0262 §Fix clause (iv)(2) keeps the query arm
    // that text's sole emitter, so the line sits at the initialiser's `@` and
    // not at the `let`.
    const t1 = theta("T1 — `@<Result<match, QueryError>>`", 'let r = @<Result<match, QueryError>>`q`\n"ok"');
    const t2 = theta("T2 — `@<Result<return, QueryError>>`", 'let r = @<Result<return, QueryError>>`q`\n"ok"');
    const t3 = theta("T3 — `let a: Result<match, QueryError> = @`q`` (propagated)", 'let a: Result<match, QueryError> = @`q`\n"ok"');
    const t4 = theta("T4 — `@<Result<array<match>, QueryError>>`", 'let r = @<Result<array<match>, QueryError>>`q`\n"ok"');
    const rows = [t1, t2, t3, t4];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [RESERVED]),
      () => [
        [reservedLine("match")],
        [reservedLine("return")],
        [reservedLine("match")],
        [reservedLine("match")],
      ],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the written ascriptions speak at their query expression (column 9) and the propagated row at its initialiser's `@`",
    ).toEqual([
      [t1.label, ["6:9"]],
      [t2.label, ["6:9"]],
      [t3.label, [`6:${"let a: Result<match, QueryError> = ".length + 1}`]],
      [t4.label, ["6:9"]],
    ]);
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "the `T`-side refusal is error-severity, so none of the four registers",
    ).toEqual(rows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (C) Rows C1–C5 — the keyword class's other existing emission sites.
// ===========================================================================

describe("b0274 (C) — the already-emitting keyword positions are byte-unchanged", () => {
  it("b0274-C: the bare query ascription and the `schema` body field type keep their lines", () => {
    // C1 is the response part's sink with no `Result` application at all; C2 is
    // the `schema` body field type, one of the three wired call sites. Both
    // green before and after: this fix adds sites, it does not move the ones
    // that emit.
    const c1 = SPELLINGS.map((k) => theta(`C1 (${k}) — \`@<${k}>\``, `let r = @<${k}>\`q\`\n"ok"`));
    expectCaptured(c1, []);
    expectRows(
      c1,
      c1.map(() => [RESERVED]),
      () => SPELLINGS.map((k) => [reservedLine(k)]),
    );
    expect(c1.map((r) => [r.label, startPositions(r)]), "the bare query ascription speaks at its query expression").toEqual(
      c1.map((r) => [r.label, ["6:9"]]),
    );

    const c2 = SPELLINGS.map((k) => theta(`C2 (${k}) — \`schema S { a: ${k} }\``, `schema S { a: ${k} }\n"ok"`));
    expectCaptured(c2, ["S"]);
    expectRows(
      c2,
      c2.map(() => [RESERVED]),
      () => SPELLINGS.map((k) => [reservedLine(k)]),
    );
    expect(c2.map((r) => [r.label, startPositions(r)]), "the `schema` body field type speaks at the declaration's start").toEqual(
      c2.map((r) => [r.label, ["6:1"]]),
    );

    expect(
      [...c1, ...c2].map((r) => [r.label, registered(r)]),
      "both existing sites refuse with an error, so none of these four registers",
    ).toEqual([...c1, ...c2].map((r) => [r.label, false]));
  });

  it("b0274-C-name-sites: bug 0249's inline-object key, the binder and bug 0153's enum variant keep their lines", () => {
    // The keyword class's NAME positions, all outside this fix's five sites and
    // all named in the §Non-goals. C3 is bug 0249's inline object type field
    // key, C4 the binder's own lexer site, C5 bug 0153's enum variant name.
    // Each is asserted at both spellings so a route that reached a name slot
    // while wiring a type slot reds here.
    const c3 = SPELLINGS.map((k) =>
      theta(`C3 (${k}) — \`schema S { p: { ${k}: string } }\``, `schema S { p: { ${k}: string } }\n"ok"`),
    );
    expectCaptured(c3, ["S"]);
    expectRows(
      c3,
      c3.map(() => [RESERVED]),
      () => SPELLINGS.map((k) => [reservedLine(k)]),
    );
    expect(c3.map((r) => [r.label, startPositions(r)]), "bug 0249's key position speaks at the declaration's start").toEqual(
      c3.map((r) => [r.label, ["6:1"]]),
    );

    const c4 = SPELLINGS.map((k) => theta(`C4 (${k}) — \`let ${k} = 3\``, `let ${k} = 3\n"ok"`));
    expectCaptured(c4, []);
    expectRows(
      c4,
      c4.map(() => [RESERVED]),
      () => SPELLINGS.map((k) => [reservedLine(k)]),
    );
    expect(c4.map((r) => [r.label, startPositions(r)]), "the binder site speaks at the bound name itself").toEqual(
      c4.map((r) => [r.label, ["6:5"]]),
    );

    const c5 = SPELLINGS.map((k) => theta(`C5 (${k}) — \`enum E { ${k} }\``, `enum E { ${k} }\n"ok"`));
    expectCaptured(c5, ["E"]);
    expectRows(
      c5,
      c5.map(() => [RESERVED]),
      () => SPELLINGS.map((k) => [reservedLine(k)]),
    );
    expect(c5.map((r) => [r.label, startPositions(r)]), "bug 0153's variant-name site speaks at the variant itself").toEqual(
      c5.map((r) => [r.label, ["6:10"]]),
    );

    expect(
      [...c3, ...c4, ...c5].map((r) => [r.label, registered(r)]),
      "every existing name site refuses with an error, so none of these six registers",
    ).toEqual([...c3, ...c4, ...c5].map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (count) One written keyword per annotation, one line, at the right capture.
// ===========================================================================

describe("b0274 (count) — the emission count is one line per written keyword per annotation", () => {
  it("b0274-count-prop: the propagated annotation draws exactly one line, at the query", () => {
    // Bug 0262 §Fix clause (iv)(2)'s withhold is inherited rather than
    // restated: the `let` site's new sink sits behind the same
    // `propagatedToQuery` guard as that site's name resolution, so the one
    // written annotation draws the one line the query arm emits. A count of one
    // alone cannot separate that from a route where the `let` capture emitted
    // and the query arm went silent, which is why the POSITION is asserted
    // beside the count.
    const rows = SPELLINGS.map((k) =>
      theta(`count-prop (${k}) — \`${propagatedPrefix(k)}@\`q\`\``, `${propagatedPrefix(k)}@\`q\`\n"ok"`),
    );
    expectCaptured(rows, []);
    expect(
      rows.map((r) => [r.label, r.codes.length]),
      "one written annotation draws one refusal: the query arm is the propagated text's sole emitter",
    ).toEqual(rows.map((r) => [r.label, 1]));
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the line sits at the initialiser's `@`, never at the `let` statement's own column 1",
    ).toEqual(SPELLINGS.map((k, i) => [rows[i]?.label, [`6:${propagatedPrefix(k).length + 1}`]]));
  });

  it("b0274-count-two-slots: two DIFFERENT keywords in the two slots draw one line each", () => {
    // The anti-over-broad half of the dedup group (E9) locks. Filtering the
    // `E`-side hits against the response part's own hits must not suppress a
    // spelling the response part never reported: `Result<match, return>` writes
    // two keywords and draws two lines, in written order — the response part's
    // `T`-side hit first, then the `E` side's. At HEAD this list has ONE entry
    // (`match`), so this cell reds on the missing second line.
    const row = theta("count-two — `@<Result<match, return>>`", 'let r = @<Result<match, return>>`q`\n"ok"');
    expectCaptured([row], []);
    expectRows([row], [[RESERVED, RESERVED]], () => [[reservedLine("match"), reservedLine("return")]]);
  });

  it("b0274-count-one-call: one spelling twice inside ONE captured text draws one line", () => {
    // The `fn` parameter site reads the whole annotation in a SINGLE
    // `collectUnresolvedNamedTypes` call, and that call publishes
    // `new Set(keywordHits)` (`src/parser/body-type-lowering.ts`), so the
    // spelling written in both `Result` arguments of one parameter type is
    // deduped by the sink itself and needs no caller-side filter. This is the
    // shape that separates the sink's own dedup from the query capture's
    // cross-slot filter asserted in group (E9).
    const row = theta(
      "count-one-call — `fn h(x: Result<match, match>): number { 1 }`",
      'fn h(x: Result<match, match>): number { 1 }\nlet r = h(Ok(1))\n"ok"',
    );
    expectCaptured([row], []);
    expectRows([row], [[RESERVED]], () => [[reservedLine("match")]]);
    expect(
      [[row.label, startPositions(row)]],
      "the `fn` parameter site speaks at the declaration's own start",
    ).toEqual([[row.label, ["6:1"]]]);
  });
});

// ===========================================================================
// (DIAG-2) The registry rows this file asserts against exist and are closed.
// ===========================================================================

describe("b0274 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0274-DIAG-2: all three codes carry an E/parse row and a placeholder-bearing Message", () => {
    // DIAG-2: the registry is closed, so a code a test asserts must have a row
    // (`reconcileClosedSet`, `tools/code-registry/index.js`). None of the
    // three codes is minted here. The `theta/parse/reserved-keyword-as-identifier`
    // row's *Trigger* enumerates no position, so a further identifier position
    // entering its emission set makes the behaviour match the row as registered
    // — which is why no *Message* byte and no row moves under version 0.273.0.
    // `theta/parse/generic-arity-mismatch` (bug 0278 §Fix, group (E10)) is a
    // pre-existing row whose own *Trigger* already names `Result<T>` as its
    // example, so this file's use of it is likewise no registry edit. This
    // cell fails loudly on the unmet precondition rather than letting
    // `msg` above substitute into an absent template.
    const rows = [RESERVED, UNRESOLVED, ARITY].map((code) => {
      const row = REGISTRY.find((r) => r.code === code);
      return [code, row?.severity, row?.phase] as const;
    });
    expect(
      rows,
      `DIAG-2: ${REGISTRY_PATH} must carry a closed-set row for each asserted code`,
    ).toEqual([
      [RESERVED, "E", "parse"],
      [UNRESOLVED, "E", "parse"],
      [ARITY, "E", "parse"],
    ]);
    expect(
      msg(RESERVED, [["<keyword>", "match"]]),
      "the keyword refusal's rendered Message must carry the spelling it names",
    ).toContain("match");
    expect(
      msg(UNRESOLVED, [["<name>", "Nope"]]),
      "the name refusal's rendered Message must carry the head it names",
    ).toContain("Nope");
  });
});
