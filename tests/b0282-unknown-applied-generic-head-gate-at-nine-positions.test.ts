import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0282 — an UNKNOWN identifier written as a generic head (`Nope<integer>`,
// `Ghost<string>`, and a DECLARED but non-parameterisable `Foo<integer>`)
// derives from no `Type` production, yet it is admitted at every
// type-reference position and lowers to the empty type there, so the
// annotation the author wrote constrains nothing
// (docs/bugs/0282-unknown-applied-generic-head-silent-at-every-position.md).
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
// (`src/parser/params.ts`) splits the text at its first `<`
// (`const lt = s.indexOf("<")`, src/parser/params.ts line 770), special-cases
// `array` at arity 1 (line 791), refuses a RESERVED head that is no
// constructor keyword (bug 0281's landed gate, lines 795–808), and — as of
// this fix (bug 0282 0.280.0) — now ALSO refuses an `Ident`-shaped head outside
// `GENERIC_ARITY` (lines 809–835) before ever reaching the permissive
// catch-all, whose `return {}` now stands at line 853 (was line 826 before
// this fix). The atom arm below it (`// Atom.`, now line 856, was line 829) —
// whose `NamedType ::= Ident` resolution failure fills `lowerCtx.unresolved`,
// the sink bug 0262's fix rendered at ten reference positions — still runs
// only when the generic-application arm declines, which an applied spelling
// never makes it do; this fix's new gate instead pushes the SAME sink
// directly from inside the generic-application arm. THAT is why, before this
// fix, the BARE `Nope` refused at all nine positions and the APPLIED
// `Nope<integer>` at none — and why, after it, both converge.
//
// WHY THE SPELLING IS ILLEGAL, from the grammar rather than from taste. `Type`
// has six alternatives (docs/spec_topics/grammar.md lines 90–95); `NamedType
// ::= Ident` (line 98) admits `Nope` bare and admits nothing with an angle
// list after it; `GenericType`'s two productions each spell their own head
// (lines 99–100) and the set is closed — "No other identifier is
// parameterisable" (line 107). `Nope`, `Ghost` and a user-declared `Foo` are
// identifiers, so an applied spelling of any of them derives from none of the
// six alternatives.
//
// THE ADJUDICATED ROUTE THIS FILE ENCODES: bug 0282 §Fix route (a) in its
// CLOSED-SET width — a head gate in `lowerTypeExpr`'s generic-application arm,
// immediately after bug 0281's reserved-head gate and after the `array`
// arity-1 branch, and BEFORE the permissive catch-all: an identifier-shaped
// head that is not in `GENERIC_ARITY` routes onto `lowerCtx.unresolved` and
// lowers no further. One judgement covers every one of the nine positions and
// the nested interior positions alike, because all nine run their type-side
// checks through `parseTypeExpression` (`src/parser/type-grammar.ts`) and their
// lowering through `lowerTypeExpr`.
//
// THE CODE THE REFUSAL ANSWERS TO: `theta/parse/unresolved-named-type`
// (docs/spec_topics/diagnostics/code-registry-parse.md line 112), chosen so the
// applied spelling converges on the row its own BARE spelling already draws —
// the one-reading-one-spelling conclusion bugs 0262 and 0277 landed. That row's
// *Trigger* as registered is scoped to a `NamedType` and to arguments nested
// inside one, so a same-commit DIAG-2 widening naming the constructor-HEAD
// position (and the declared-head case, where the name resolves and the
// APPLICATION is the fault) is owed by the implementer of the fix — it is not
// this witness's to write, and this file asserts the code by name rather than
// asserting any registry prose.
//
// WHAT THE ROUTE MOVES. Groups (M), (G), (I) and (N) assert a refusal where
// HEAD produces an EMPTY diagnostic list — that is the filed red. Groups (C),
// (K) and (B) are measured and green before and after: the closed set keeps its
// own readings including the arity row and its two silent positions, bug 0281's
// landed reserved-head refusals are byte-unchanged, and bug 0262's landed
// bare-name refusals are byte-unchanged.
//
// THE GATE ORDER IS A PINNED CONTROL, group (C). For a head the closed set
// HOLDS, nothing changes: `Result<integer>` keeps drawing
// `theta/parse/generic-arity-mismatch` (and `theta/parse/result-in-schema-position`
// at the three lowered-schema positions) and never this file's refusal, and
// stays SILENT at the two positions with no wired emitter; `array<string>` stays
// clean and registering at all nine. A gate placed AHEAD of the arity check, or
// keyed on the presence of an argument list rather than on the head's
// membership in the closed set, reds here rather than in the committed-fixture
// gate.
//
// THE INERT HALF, group (I). Because the applied head lowers to the empty type,
// the annotation constrains nothing: with `schema Foo { m: string }` declared in
// the same file, `let a: Foo = "mismatch"` draws
// `theta/parse/let-rhs-type-mismatch` and `let a: Foo<integer> = "mismatch"`
// draws nothing at all. That pair is the severity evidence — a constraint the
// author wrote, and which the file supports, is dropped by writing the head with
// an angle list — and the refusal resurrects it by refusing the application.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (tests/helpers/e2e-s1.ts — the shipped whole-file entry point wrapped in
// inert deps, no behaviour stubbed). An integration tier would add a round trip
// to a value already fixed at the parse boundary and observe nothing sharper; a
// live tier cannot see a parse-time diagnostic LIST at all, only the
// registration outcome it implies, which the companion live cell
// (tests/live/b0282live-unknown-applied-generic-head-registration.test.ts)
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
// diagnostic nor one at the wrong position can hide. `Nope` and `Ghost` are
// declared and imported nowhere, at any version.

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

/** The row an applied head outside the closed set draws under the adjudicated routing. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
/** Bug 0281's landed row for an applied RESERVED head; a lock here, not a subject. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
/** The closed set's own arity row, which the head gate must not displace. */
const ARITY = "theta/parse/generic-arity-mismatch";
/** `Result`'s own row at the three lowered-schema positions. */
const RESULT_SCHEMA = "theta/parse/result-in-schema-position";
/** What bug 0281's `Ok<…>` alias cell draws, at the declaration and not the type. */
const EMPTY_SCHEMA = "theta/parse/empty-schema-body";
/** That alias cell's second and third lines, on the angle list left in statement position. */
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

/** The name refusal, rendered for the head `name`. */
function unresolvedLine(name: string): string {
  return line(UNRESOLVED, [["<name>", name]]);
}

/** Bug 0281's keyword refusal, rendered for the spelling `keyword`. */
function reservedLine(keyword: string): string {
  return line(RESERVED, [["<keyword>", keyword]]);
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
  const doc = parseDoc(source, "b0282.theta");
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
 * (`src/extension/production-composition.ts` line 3053, consulted at line
 * 1570) is `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
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
  /** The fixture, in the shape bug 0282 §Reproduction spells it. */
  readonly build: (spelling: string) => LoadRow;
  /** The declarations the fixture captures, asserted before any disposition. */
  readonly decls: readonly string[];
  /**
   * The `line:column` this position emits at. Each is MEASURED, at this
   * position, over the same fixture shape carrying the BARE spelling of the
   * head under test — the reading bug 0282 §Expected says an applied head
   * converges on ("at that position's existing sibling range"). Group (B)
   * asserts the bare spelling against these same values, so the range is fixed
   * by the position's existing sibling emission rather than chosen here.
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
      head: spelling.includes("<") ? spelling.slice(0, spelling.indexOf("<")) : spelling,
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

// ===========================================================================
// (M) The subject — the 9 × 2 matrix of an applied unknown head.
// ===========================================================================

const UNKNOWN_SPELLINGS = ["Nope<integer>", "Ghost<string>"] as const;

describe("b0282 (M) — an applied unknown head is refused at all nine type-reference positions", () => {
  it("b0282-M: each of the eighteen cells draws the name refusal and does not register", () => {
    // The heart of the report, and the largest red group: at HEAD all eighteen
    // of these diagnostic lists are EMPTY and every document registers, because
    // the head is read as an arbitrary constructor name at both seams and
    // judged by neither — `walkType`'s only rule about a generic node's own
    // head is a `GENERIC_ARITY` lookup guarded by a definedness test, and
    // `lowerTypeExpr`'s catch-all returned the empty type at HEAD
    // (src/parser/params.ts line 826 at HEAD `42226b1e`; the fix's own gate now
    // intercepts before that catch-all is ever reached, at line 809, and the
    // catch-all itself is now at line 853). Unlike bug 0281's reserved heads, an
    // unknown head does NOT break the alias declaration parse, so the ninth
    // column here is the ordinary refusal rather than that report's triple —
    // which is the one observable difference between the two subjects
    // (bug 0282 §Reproduction, control 4). The head text travels in the
    // *Message*, so no cell can satisfy another's assertion.
    const probes = cells([...UNKNOWN_SPELLINGS]);
    expectMatrix(
      probes,
      () => [UNRESOLVED],
      (p) => [unresolvedLine(p.head)],
      () => false,
    );
  });

  it("b0282-M-position: each refusal sits at the range that position already uses for the bare spelling", () => {
    // The range is fixed by measurement, not chosen: §Expected says the refusal
    // lands "at that position's existing sibling range", and group (B) below
    // asserts the BARE `Nope` at exactly these values under bug 0262's landed
    // rule. This cell reds on a route that emitted the right code from the
    // wrong position, which the columns separate on one source line.
    const probes = cells([...UNKNOWN_SPELLINGS]);
    expect(
      probes.map((p) => [p.row.label, startPositions(p.row)]),
      "an applied head refuses at the same range its position already uses for the bare spelling",
    ).toEqual(probes.map((p) => [p.row.label, [p.position.at]]));
  });

  it("b0282-M-arity-free: an applied unknown head at any argument count is refused once", () => {
    // Arity is irrelevant to the verdict, in both directions. `Nope` declares
    // no arity to violate, so `theta/parse/generic-arity-mismatch` is not a
    // candidate code for it (its *Trigger* is scoped to the closed set,
    // code-registry-parse.md line 65) and the membership test is the whole
    // judgement. At HEAD this is SILENT and registers, exactly as the arity-1
    // spelling is. A route that reached this input through the arity check
    // instead of the closed-set test reds here with a different code.
    const r = theta(
      "M-arity — `let a: Nope<integer, string, boolean> = 3`",
      'let a: Nope<integer, string, boolean> = 3\n"ok"',
    );
    expectCaptured([r], []);
    expectRows([r], [[UNRESOLVED]], () => [[unresolvedLine("Nope")]]);
    expect(
      [[r.label, startPositions(r)]],
      "the `let` position speaks at the statement's own start",
    ).toEqual([[r.label, ["6:1"]]]);
    expect([[r.label, registered(r)]], "a refused document is not registered").toEqual([
      [r.label, false],
    ]);
  });
});

// ===========================================================================
// (G) The two pinned `Ghost<1,2>` cells this report owns outright.
// ===========================================================================

describe("b0282 (G) — the multi-argument unknown head at the two schema-feeding declarations", () => {
  it("b0282-G: `schema X = Ghost<1,2>` and `schema X { f: Ghost<1,2> }` refuse and do not register", () => {
    // These two spellings are the cells `tests/schema-alias-union-decl.test.ts`
    // pins as measured-not-decided (its `F_ALIAS_GHOST_APPLIED` and
    // `F_FIELD_GHOST_APPLIED` fixtures, asserted to an EMPTY expected list),
    // and bug 0282 §Fix "Flip authority" names them as this report's own to
    // re-found. They are asserted here rather than there so this witness reds
    // and greens under its own authority; the implementer re-founds the pinned
    // pair in the same commit. Two literal type arguments are legal `Type`s
    // (`LiteralType`, grammar.md line 102), so the head is the only fault and
    // exactly one line is expected at each position.
    const alias = theta("G-alias — `schema X = Ghost<1,2>`", 'schema X = Ghost<1,2>\n"ok"');
    const field = theta("G-field — `schema X { f: Ghost<1,2> }`", 'schema X { f: Ghost<1,2> }\n"ok"');
    expectCaptured([alias, field], ["X"]);
    expectRows(
      [alias, field],
      [[UNRESOLVED], [UNRESOLVED]],
      () => [[unresolvedLine("Ghost")], [unresolvedLine("Ghost")]],
    );
    expect(
      [alias, field].map((r) => [r.label, registered(r)]),
      "neither declaration registers once its arm or field type is refused",
    ).toEqual([alias, field].map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (I) The inert half — the DECLARED head, and the constraint it drops.
// ===========================================================================

describe("b0282 (I) — a declared schema name written with an angle list stops dropping its constraint", () => {
  it("b0282-I: `Foo<integer>` refuses where the file declares `Foo`, and the bare spelling keeps its own check", () => {
    // The severity evidence of the whole report, as a PAIR: the file declares
    // `Foo`, the bare annotation enforces it, and at HEAD the applied spelling
    // of the same head enforces nothing — `let a: Foo<integer> = "mismatch"`
    // loads with an EMPTY list and registers, because the annotation lowered to
    // the empty type and the binding's own check ran against a type admitting
    // everything. The applied half is RED at HEAD; the bare control is GREEN on
    // both sides and is what makes the dropped constraint observable rather
    // than merely asserted.
    //
    // The refusal names the HEAD, not the annotation's legality as a name:
    // grammar.md line 107 closes the constructor set, so `Foo<integer>` is
    // neither a legal application nor a reference to `Foo`. Bare-`Foo`
    // legality is untouched — only the APPLICATION refuses (§Non-goals:
    // introducing user-defined parameterised types is out of scope).
    const applied = theta(
      'I-declared — `schema Foo { m: string }` + `let a: Foo<integer> = "mismatch"`',
      'schema Foo { m: string }\nlet a: Foo<integer> = "mismatch"\n"ok"',
    );
    expectCaptured([applied], ["Foo"]);
    expectRows([applied], [[UNRESOLVED]], () => [[unresolvedLine("Foo")]]);
    expect(
      [[applied.label, registered(applied)]],
      "the applied spelling is refused at the head, so the document does not register",
    ).toEqual([[applied.label, false]]);

    const bare = theta(
      'I-declared-control — `schema Foo { m: string }` + `let a: Foo = "mismatch"`',
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
      "the bare spelling keeps drawing its own mismatch, unchanged on both sides of the gate",
    ).toEqual([[bare.label, false]]);
  });
});

// ===========================================================================
// (N) Nesting — a legal enclosing application does not restore the judgement.
// ===========================================================================

describe("b0282 (N) — an applied unknown head one level down is refused where the bare name is", () => {
  it("b0282-N: the four nestings refuse, and their bare-name controls are unmoved", () => {
    // RED at HEAD in the first half: `walkType` descends a generic node's
    // ARGUMENTS — which is why `array<Nope>` refuses today — and discards the
    // interior head, so `array<Nope<integer>>` is silent where `array<Nope>` is
    // not. The gate sits at the one recursive lowering seam, so the interior
    // application is judged exactly as the outermost one is; the refusal names
    // the interior head, since that is the mistake the author wrote.
    //
    // The bare controls in the second half are bug 0262's landed refusals and
    // must be byte-unchanged (§Non-goals: "Bug 0262's landed bare-name rule is
    // not reopened"). They are the other half of §Reproduction's nesting table:
    // asserting only the applied side would not separate a gate that judged the
    // head from one that broke name resolution underneath it.
    const nested = [
      theta("N1 — `let a: array<Nope<integer>> = []`", 'let a: array<Nope<integer>> = []\n"ok"'),
      theta(
        "N2 — `let a: Result<integer, Nope<integer>> = Ok(1)`",
        'let a: Result<integer, Nope<integer>> = Ok(1)\n"ok"',
      ),
      theta(
        "N3 — `@<Result<integer, Nope<integer>>>`",
        'let r = @<Result<integer, Nope<integer>>>`q`\n"ok"',
      ),
    ];
    expectCaptured(nested, []);
    const nestedField = theta(
      "N4 — `schema S { f: array<Nope<integer>> }`",
      'schema S { f: array<Nope<integer>> }\n"ok"',
    );
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
      theta("N-control-1 — `let a: array<Nope> = []`", 'let a: array<Nope> = []\n"ok"'),
      theta(
        "N-control-2 — `let a: Result<integer, Nope> = Ok(1)`",
        'let a: Result<integer, Nope> = Ok(1)\n"ok"',
      ),
      theta("N-control-3 — `@<Result<integer, Nope>>`", 'let r = @<Result<integer, Nope>>`q`\n"ok"'),
    ];
    expectCaptured(bare, []);
    const bareField = theta(
      "N-control-4 — `schema S { f: array<Nope> }`",
      'schema S { f: array<Nope> }\n"ok"',
    );
    expectCaptured([bareField], ["S"]);
    expectRows(
      [...bare, bareField],
      [...bare, bareField].map(() => [UNRESOLVED]),
      () => [...bare, bareField].map(() => [unresolvedLine("Nope")]),
    );
    expect(
      [...bare, bareField].map((r) => [r.label, registered(r)]),
      "bug 0262's landed bare-name refusals keep denying registration, unchanged on both sides",
    ).toEqual([...bare, bareField].map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (C) The gate-order controls — the closed set keeps its own readings.
// ===========================================================================

describe("b0282 (C) — the closed set is unmoved by a gate that judges membership", () => {
  it("b0282-C-array: `array<string>` stays clean and registering at all nine positions", () => {
    // GREEN at HEAD and after, and the anti-over-broad lock of the whole file.
    // `array` is one of the two heads `GENERIC_ARITY` holds (grammar.md lines
    // 99–100, closed at line 107), the committed corpus spells it, and a gate
    // keyed on the presence of an argument list rather than on the head's
    // membership would refuse shipped source and red here rather than in
    // `tests/committed-fixture-parse-gate.test.ts`.
    const probes = cells(["array<string>"]);
    expectMatrix(
      probes,
      () => [],
      () => [],
      () => true,
    );
  });

  it("b0282-C-arity: `Result<integer>` keeps the arity row, and keeps its two silent positions", () => {
    // GREEN at HEAD and after — the gate-ORDER control. A head the closed set
    // HOLDS is judged by the arity check and never by the membership test, so
    // `Result<integer>` must keep drawing `theta/parse/generic-arity-mismatch`
    // (beside `theta/parse/result-in-schema-position` at the three
    // lowered-schema positions) and never this file's refusal. The two
    // positions that stay SILENT are the `"inline-object-shape"` rule set's —
    // the `@<T>` capture's `E` argument and the `invoke<Type>` ascription —
    // which bug 0282 §Non-goals leaves alone; they are also the two positions
    // with no wired not-expression emitter, which is why that family is not the
    // code this file's refusals answer to (§Fix, candidate 2). A gate placed
    // BEFORE the arity check reds here.
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
});

// ===========================================================================
// (K) Bug 0281's landed reserved-head gate — a lock, byte-for-byte.
// ===========================================================================

describe("b0282 (K) — the applied RESERVED head keeps bug 0281's landed verdict", () => {
  it("b0282-K: `Ok<integer>` draws the keyword refusal at eight positions and the alias triple at the ninth", () => {
    // GREEN at HEAD and after. Bug 0281's fix (version 0.277.0) gates a head
    // that is a RESERVED spelling and no constructor keyword
    // (src/parser/params.ts lines 795–808), and this report's gate sits
    // immediately after it. Order matters: a closed-set gate written ahead of
    // the reserved gate would capture `Ok<integer>` and change its code, so
    // this cell is where such a mis-ordering reds. The alias cell keeps its
    // triple because a reserved head breaks the DECLARATION parse before any
    // type-side pass runs — the one observable that separates bug 0281's
    // subject from this one (§Reproduction, control 4).
    const probes = cells(["Ok<integer>"]);
    const aliasPrefix = "schema S = ";
    expectMatrix(
      probes,
      (p) =>
        p.position.id === "schema-alias" ? [EMPTY_SCHEMA, UNSUPPORTED, UNSUPPORTED] : [RESERVED],
      (p) =>
        p.position.id === "schema-alias"
          ? [
              line(EMPTY_SCHEMA, [["<X>", "S"]]),
              line(UNSUPPORTED, [["<construct>", "stray '<' in statement position"]]),
              line(UNSUPPORTED, [["<construct>", "stray '>' in statement position"]]),
            ]
          : [reservedLine(p.head)],
      () => false,
    );
    expect(
      probes.map((p) => [p.row.label, startPositions(p.row)]),
      "bug 0281's landed ranges, unmoved by a gate that runs after its own",
    ).toEqual(
      probes.map((p) => [
        p.row.label,
        p.position.id === "schema-alias"
          ? [
              "6:1",
              `6:${aliasPrefix.length + p.head.length + 1}`,
              `6:${aliasPrefix.length + p.spelling.length}`,
            ]
          : [p.position.at],
      ]),
    );
  });
});

// ===========================================================================
// (B) Bug 0262's landed bare-name rule — a lock, and the range oracle.
// ===========================================================================

describe("b0282 (B) — the BARE unknown name keeps bug 0262's landed refusal at all nine positions", () => {
  it("b0282-B: bare `Nope` refuses at every position, at the ranges group (M) converges on", () => {
    // GREEN at HEAD and after, and the oracle for group (M)'s ranges: these are
    // the "existing sibling range"s §Expected names, measured here rather than
    // chosen there. Bug 0282 §Non-goals: "Bug 0262's landed bare-name rule is
    // not reopened" — `Nope` refuses at all nine positions and must keep
    // refusing with the same code and ranges. A gate that reached the atom arm,
    // or that displaced the `NamedType` resolution rather than sitting beside
    // it, reds here.
    const bareName = POSITIONS.map((position) => ({ position, row: position.build("Nope") }));
    expectMatrix(
      bareName,
      () => [UNRESOLVED],
      () => [unresolvedLine("Nope")],
      () => false,
    );
    expect(
      bareName.map((p) => [p.row.label, startPositions(p.row)]),
      "the bare name's own ranges — the values group (M) asserts the applied spelling converges on",
    ).toEqual(bareName.map((p) => [p.row.label, [p.position.at]]));
  });
});

// ===========================================================================
// (DIAG-2) The registry rows this file asserts against exist and are closed.
// ===========================================================================

describe("b0282 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0282-DIAG-2: all seven codes carry an E row of their own phase and a placeholder-bearing Message", () => {
    // DIAG-2: the registry is closed, so a code a test asserts must have a row
    // (`reconcileClosedSet`, tools/code-registry/index.js). No code is minted
    // by this report's route and `tests/fixtures/h7a/permitted-codes.json` is
    // byte-unchanged: `theta/parse/unresolved-named-type` is pre-existing
    // (code-registry-parse.md line 112) and the fix BORROWS it. What that row
    // still owes at version 0.280.0 is a same-commit DIAG-2 *Trigger* widening —
    // its subject as registered is "A `NamedType` that resolves to no
    // declaration usable at the position it is written" plus arguments nested
    // inside one, and a name written AS a constructor head is neither, with the
    // declared-head case (`Foo<integer>` with `schema Foo` in the file) owing
    // its own sentence since that name RESOLVES and the APPLICATION is the
    // fault. That widening belongs to the implementer; this cell asserts only
    // that the row exists, is error-severity and parse-phase, and interpolates
    // the head it names. It fails loudly on the unmet precondition rather than
    // letting `msg` above substitute into an absent template.
    const rows = [UNRESOLVED, RESERVED, ARITY, RESULT_SCHEMA, EMPTY_SCHEMA, UNSUPPORTED, LET_MISMATCH].map(
      (code) => {
        const r = REGISTRY.find((x) => x.code === code);
        return [code, r?.severity, r?.phase] as const;
      },
    );
    expect(
      rows,
      `DIAG-2: ${REGISTRY_PATH} must carry a closed-set row for each asserted code`,
    ).toEqual([
      [UNRESOLVED, "E", "parse"],
      [RESERVED, "E", "parse"],
      [ARITY, "E", "parse"],
      [RESULT_SCHEMA, "E", "parse"],
      [EMPTY_SCHEMA, "E", "parse"],
      [UNSUPPORTED, "E", "parse"],
      [LET_MISMATCH, "E", "type"],
    ]);
    expect(
      msg(UNRESOLVED, [["<name>", "Ghost"]]),
      "the name refusal's rendered Message must carry the head it names",
    ).toContain("Ghost");
  });
});
