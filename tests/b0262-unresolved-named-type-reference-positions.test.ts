import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lexBytes, parseDoc, parseDocBytes } from "./helpers/e2e-s1";

// Bug 0262 — a `NamedType` that resolves to no declaration draws ZERO
// diagnostics at nine of the sixteen probed reference positions
// (docs/bugs/0262-unresolved-named-type-silent-at-nine-reference-positions.md).
// `unresolvedNamedTypeDiagnostic` (`src/parser/theta-document.ts`) mints
// `error theta/parse/unresolved-named-type: unresolved named type '<name>'`.
//
// WHAT THIS FILE WITNESSES, IN THE PAST TENSE IT BELONGS IN. Before the
// change-set this file ships with, that builder was reached from seven
// captures — the `params:` right-hand side, the `@<T>` query annotation, a
// `schema` body field type, a `schema X = …` alias/union right-hand side, an
// object-constructor name and a `match` object-pattern head — and four
// captures called no name-resolution pass at all: `walkStatement`'s `"let"`
// annotation read, its `"fn"` parameter type read and its return type read,
// and `walkExpr`'s `"invoke"` arm, whose own comment stated the gap. The
// interiors of those four captures — a generic argument, a union arm, a
// `Result` argument, an inline object field — were the remaining silent rows.
// The four captures now RUN the resolution pass beside their own annotation
// READ: the `let` annotation is read at src/parser/theta-document.ts line 8052
// and resolved at line 8091, the `fn` parameter type is read at line 8172 and
// resolved at line 8201, the `fn` return type is read at line 8213 and
// resolved at line 8240, and the `invoke<T>` ascription is read at line 8646
// and resolved at line 8662. Every capture routes its names through
// `collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts`) against
// the whole-file name universe.
//
// THE SETTLED TARGET BEHAVIOUR THIS FILE ENCODES (the bug document's §Fix
// route): all sixteen positions refuse an unresolvable head with the registered
// code, and the theta does not register — an error-severity `theta/parse/*`
// diagnostic denies registration, the GOV-15 loads-cleanly reading
// (docs/spec_topics/governance/source-language-stability.md line 9). Four
// boundary decisions bound the widening, and each is locked by its own group
// below:
//
//   D1 — a builtin error-model name is ADMITTED at the four new captures.
//   docs/spec_topics/diagnostics/code-registry-parse.md line 112 already admits
//   "a builtin error-model name (`QueryError`)" at the pattern-head position,
//   docs/spec_topics/errors-and-results/error-model.md line 61 states thetas
//   may declare functions returning `Result<T, QueryError>` explicitly, and the
//   shipped corpus file docs/examples/personas.thetalib line 7 spells
//   `fn rate_strictness(a: Author): Result<integer, QueryError> {` at an `fn`
//   RETURN type — so a naive widening would newly refuse a committed fixture
//   and red `tests/committed-fixture-parse-gate.test.ts`.
//
//   D2 — a propagated `let` annotation keeps the `@<T>` arm as SOLE emitter.
//   `parseLet` (`src/parser/theta-document.ts`) propagates a `let` annotation
//   verbatim onto a bare-query initialiser (src/parser/theta-document.ts lines
//   2311 and 2319 set `schemaFromLetAnnotation`), and `walkExpr`'s `"query"`
//   arm (src/parser/theta-document.ts line 8820) is that text's sole emitter.
//   The count stays at exactly one under the widening, and does not rise to
//   two.
//
//   D3 — a reserved-keyword head at the four new captures is bug 0274's
//   subject, not this report's. [Bug
//   0274](../docs/bugs/0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md)
//   §Fix route (a), taken A-SCOPED under the operator's re-ruling, threads the
//   `reservedKeywords` sink at these same four captures at version 0.272.0, so a
//   spelling this report's own §Fix left unthreaded now draws
//   `theta/parse/reserved-keyword-as-identifier`
//   (docs/spec_topics/diagnostics/code-registry-parse.md line 21) instead of
//   nothing. This report's own widening of `theta/parse/unresolved-named-type`
//   is untouched by that fix: bug 0274 threads a second sink beside the one
//   this report wired, it does not re-open this row's own emission.
//
//   D4 — per-capture guard. A capture whose own type walk already drew an
//   error-severity diagnostic keeps that diagnostic ALONE, the landed guard
//   shape at src/parser/theta-document.ts lines 8058 through 8063.
//
// WHAT WAS RED BEFORE THE CHANGE-SET, AND FOR WHAT. The eighteen cells of
// group (r) — rows r1 through r9 of the bug document's §Reproduction table,
// each at both the `nope` and the `Nope` spelling — assert one
// `theta/parse/unresolved-named-type` where the pre-change parser produced an
// EMPTY diagnostic list, so each red read "expected
// [theta/parse/unresolved-named-type], observed []". Those cells are the
// widening's witness and are green under it. Every other group was green
// before the change and stays green: groups (c) and (p) are the seven
// already-emitting positions plus the `match` pattern head (byte stability),
// and groups D1, D2, D3, D4, (n) and (e) are the boundary tripwires against a
// fix that over-reaches.
//
// CASE INDEPENDENCE. `resolveNamed`'s A–Z read-seam fence
// (src/parser/type-compat.ts lines 147 through 150, bug 0135's §Fix) makes a
// lowercase head unresolvable by construction, and the emitting captures test
// resolution rather than case. Every row below is therefore run at both
// spellings, and group (i) asserts the two diagnostic lists are structurally
// identical apart from the name bytes.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (tests/helpers/e2e-s1.ts line 39 — the shipped whole-file entry point wrapped
// in the standard inert deps, no behaviour stubbed). An integration tier would
// add a round trip to a value already fixed at the parse boundary and observe
// nothing sharper; a live tier cannot see a parse-time diagnostic list at all,
// only the registration outcome it implies, which the standalone live cell
// `tests/live/b0262live-unresolved-named-type-reference-position-live-cell.test.ts`
// covers. Registration is asserted here through the composition root's own
// predicate rather than a live load.
//
// NO SILENT SKIPPING. Nothing here early-returns, branches on the environment
// or skips. `msg` asserts its registry row is present and carries each
// placeholder it fills before substituting, and every cell asserts its fixture
// captured at least one body statement and every declaration it names BEFORE
// reading a disposition off it — so a fixture the parser dropped upstream reds
// by naming the loss instead of passing on an empty list that reads as a clean
// load.
//
// ANTI-VACUITY. Every cell asserts an ORDERED WHOLE-LIST equality over the
// UNFILTERED `doc.diagnostics` — never containment — so neither an extra
// diagnostic nor one at the wrong position can hide. Neither `nope` nor `Nope`
// is declared or imported in any fixture of groups (r), (c), (p) or (i).

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

/** The row the widening emits at all sixteen positions; its *Message* does not move. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
/** D4's first guard cell: the position rule the `let` capture's own walk draws. */
const VOID_POSITION = "theta/parse/void-in-non-return-position";
/** D4's second guard cell: the inline interior's own entry-walk refusal. */
const MALFORMED_FIELD = "theta/parse/malformed-schema-field";
/** Group (n): the check the `let` annotation recovers once the head resolves. */
const LET_MISMATCH = "theta/parse/let-rhs-type-mismatch";
/** Group (n): the check the `fn` parameter type recovers once the head resolves. */
const ARG_MISMATCH = "theta/parse/fn-arg-type-mismatch";
/** Group (D6): the naming diagnostic the unclosed-parameter-list fixture draws first. */
const SINGLE_LINE_IF = "theta/parse/single-line-if";
/** Group (D6): the naming diagnostic the unclosed-parameter-list fixture draws beside it. */
const PARAM_LIST_UNCLOSED = "theta/parse/fn-param-list-unclosed";
/** Group (D6 cont.): the same-line stray token a `let` capture's window does NOT cover. */
const UNSUPPORTED_FEATURE = "theta/parse/unsupported-feature";
/** Group (D6 cont.): the body-interior lexer fault an `fn` HEADER capture's window does NOT cover. */
const LITERAL_NEWLINE = "theta/parse/literal-newline-in-string";
/** Group (D6 cont.): the argument-list fault an `invoke<T>` ASCRIPTION capture's window does NOT cover. */
const INVOKE_NON_THETA = "theta/parse/invoke-non-theta-extension";
/** Group (D6 cont.): the initialiser-interior fault raised by the SAME walk as the refusal. */
const BARE_OBJECT = "theta/parse/bare-object-literal";

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

/** The widening's refusal, rendered for the head `name`. */
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

function rowOf(label: string, src: string): LoadRow {
  const doc = parseDoc(src, "b0262.theta");
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

/** The frontmatter every fixture carries, per the bug document's §Reproduction. */
const FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

/** A `mode: prompt` theta whose body is `body` verbatim. */
function theta(label: string, body: string): LoadRow {
  return rowOf(label, `${FRONTMATTER}${body}\n`);
}

/** A `mode: prompt` theta whose `params:` block declares one field of the given type text. */
function paramsTheta(label: string, typeText: string): LoadRow {
  return rowOf(
    label,
    `---\ndescription: d\nmode: prompt\nparams:\n  x: '${typeText}'\n---\n\n"ok"\n`,
  );
}

/**
 * The composition root's registration gate, mirrored: `hasLoadParseError`
 * (`src/extension/production-composition.ts`) is
 * `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
 * d.code.startsWith("theta/parse/")))`, and a document carrying one is not
 * registered. Every refusal below is a `theta/parse/…` code, so the code-prefix
 * half of the real predicate always holds here.
 */
function registered(row: LoadRow): boolean {
  return !row.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

/**
 * Assert every row parsed to a body and captured exactly the declarations it
 * names, before any disposition is read off it. A dropped statement produces an
 * empty diagnostic list on some paths, which is indistinguishable from a clean
 * load unless the capture is asserted separately — this is the precondition,
 * failing loudly.
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
// The sixteen probed positions, plus the seventeenth.
// ===========================================================================

/** One probed reference position: its fixture, parameterised by the head spelling. */
interface Position {
  readonly id: string;
  readonly what: string;
  /** The fixture, verbatim from the bug document's §Reproduction table. */
  readonly build: (head: string) => LoadRow;
}

/** Rows r1 through r9 — the nine positions the widening newly covers. */
const SILENT_POSITIONS: readonly Position[] = [
  {
    id: "r1",
    what: "`let` annotation",
    build: (n) => theta(`r1 (${n}) — let annotation`, `let a: ${n} = 3\n"ok"`),
  },
  {
    id: "r2",
    what: "`fn` parameter type",
    build: (n) =>
      theta(`r2 (${n}) — fn parameter`, `fn f(x: ${n}): number { 1 }\nlet r = f(3)\n"ok"`),
  },
  {
    id: "r3",
    what: "`fn` return type",
    build: (n) => theta(`r3 (${n}) — fn return`, `fn f(): ${n} { 3 }\n"ok"`),
  },
  {
    id: "r4",
    what: "generic argument inside a `let` annotation",
    build: (n) => theta(`r4 (${n}) — generic argument`, `let xs: array<${n}> = [1]\n"ok"`),
  },
  {
    id: "r5",
    what: "`invoke<T>` ascription",
    build: (n) => theta(`r5 (${n}) — invoke ascription`, `let r = invoke<${n}>("./x.theta")\n"ok"`),
  },
  {
    id: "r6",
    what: "union arm in a `let` annotation",
    build: (n) => theta(`r6 (${n}) — union arm in a let`, `let a: ${n} | number = 3\n"ok"`),
  },
  {
    id: "r7",
    what: "union arm in an `fn` parameter type",
    build: (n) =>
      theta(`r7 (${n}) — union arm in an fn parameter`, `fn f(x: ${n} | number): number { 1 }\n"ok"`),
  },
  {
    id: "r8",
    what: "`Result` argument in an `fn` return type",
    build: (n) =>
      theta(`r8 (${n}) — Result argument`, `fn f(): Result<${n}, string> { Ok(1) }\n"ok"`),
  },
  {
    id: "r9",
    what: "inline object field in an `fn` parameter type",
    build: (n) =>
      theta(`r9 (${n}) — inline object field`, `fn f(x: { g: ${n} }): number { 1 }\n"ok"`),
  },
];

/** Rows r10 through r16 — the seven positions that diagnosed before the widening too. */
const DIAGNOSING_POSITIONS: readonly Position[] = [
  {
    id: "r10",
    what: "inline object field under `params:`",
    build: (n) => paramsTheta(`r10 (${n}) — params inline object field`, `{ g: ${n} }`),
  },
  {
    id: "r11",
    what: "`@<T>` query annotation",
    build: (n) => theta(`r11 (${n}) — query annotation`, `let r = @<${n}>\`hi\`\n"ok"`),
  },
  {
    id: "r12",
    what: "`schema` body field type",
    build: (n) => theta(`r12 (${n}) — schema body field`, `schema S { f: ${n} }\n"ok"`),
  },
  {
    id: "r13",
    what: "`params:` right-hand side",
    build: (n) => paramsTheta(`r13 (${n}) — params right-hand side`, n),
  },
  {
    id: "r14",
    what: "alias right-hand side",
    build: (n) => theta(`r14 (${n}) — alias right-hand side`, `schema A = ${n}\nlet a: A = 3\n"ok"`),
  },
  {
    id: "r15",
    what: "alias/union right-hand side",
    build: (n) =>
      theta(`r15 (${n}) — alias union right-hand side`, `schema A = ${n} | number\nlet a: A = 3\n"ok"`),
  },
  {
    id: "r16",
    what: "object-constructor name",
    build: (n) => theta(`r16 (${n}) — object constructor`, `let v = ${n} { a: 1 }\n"ok"`),
  },
];

/**
 * The seventeenth position, added to the table since bug 0051's probe: the
 * `match` object-pattern head, emitted from `parsePattern`
 * (`src/parser/theta-document.ts`). Already diagnosing at both spellings; a
 * CONTROL the widening must not move.
 */
const PATTERN_HEAD: Position = {
  id: "r17",
  what: "`match` object-pattern head",
  build: (n) =>
    theta(`r17 (${n}) — match object-pattern head`, `let v = 1\nlet z = match v { ${n} { a } => 1, _ => 2 }\n"ok"`),
};

/** The two head spellings every position is probed at. */
const SPELLINGS = ["nope", "Nope"] as const;

/** Every (position, spelling) pair, in table order. */
function cells(positions: readonly Position[]): { row: LoadRow; head: string; id: string }[] {
  return positions.flatMap((p) => SPELLINGS.map((head) => ({ row: p.build(head), head, id: p.id })));
}

// ===========================================================================
// (r) The nine newly-refusing positions — 18 cells, red before the widening.
// ===========================================================================

describe("b0262 (r) — rows r1 through r9 refuse an unresolvable head at both spellings", () => {
  it("b0262-r: each of the nine silent positions draws exactly one unresolved-named-type", () => {
    // The heart of the report. At HEAD each of these eighteen diagnostic lists
    // is EMPTY, so the head names nothing and the position's own type layer
    // stops deciding: `annotationToCompatType`
    // (`src/parser/type-layer-checks.ts`) mints a `named` `CompatType` for the
    // text, `resolveNamed` (`src/parser/type-compat.ts`) answers `undefined`,
    // and `decide`'s `named` arms answer "unknown", so every check keyed on
    // that answer defers. Under the settled route each position refuses with
    // the registered code, at the registered *Message* bytes, for both
    // spellings alike.
    const probes = cells(SILENT_POSITIONS);
    expectCaptured(
      probes.map((c) => c.row),
      [],
    );
    expectRows(
      probes.map((c) => c.row),
      probes.map(() => [UNRESOLVED]),
      () => probes.map((c) => [unresolvedLine(c.head)]),
    );
  });

  it("b0262-r-registration: an error-severity refusal denies registration at all nine positions", () => {
    // The GOV-15 loads-cleanly reading
    // (docs/spec_topics/governance/source-language-stability.md line 9): an `E`
    // denies registration. At HEAD all eighteen register — the bug document's
    // "registers: yes" column — and under the route none does.
    const probes = cells(SILENT_POSITIONS);
    expectCaptured(
      probes.map((c) => c.row),
      [],
    );
    expect(
      probes.map((c) => [c.row.label, c.row.doc.diagnostics.map((d: Diagnostic) => d.severity)]),
      `${UNRESOLVED} is an E row, so its emission must be error-severity at every position`,
    ).toEqual(probes.map((c) => [c.row.label, ["error"]]));
    expect(
      probes.map((c) => [c.row.label, registered(c.row)]),
      "a refused document is not registered",
    ).toEqual(probes.map((c) => [c.row.label, false]));
  });
});

// ===========================================================================
// (c) The seven already-diagnosing positions — 14 byte-stability controls.
// ===========================================================================

describe("b0262 (c) — rows r10 through r16 are byte-unchanged by the widening", () => {
  it("b0262-c: each already-emitting position keeps exactly one unresolved-named-type", () => {
    // Green before the widening and under it. These seven captures already
    // route their names
    // through `collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts`)
    // or emit the code inline (`parseParams`, `src/parser/params.ts`), so a
    // route that re-entered a covered capture from a new call site would red
    // here with a second line.
    const probes = cells(DIAGNOSING_POSITIONS);
    expectRows(
      probes.map((c) => c.row),
      probes.map(() => [UNRESOLVED]),
      () => probes.map((c) => [unresolvedLine(c.head)]),
    );
    expect(
      probes.map((c) => [c.row.label, registered(c.row)]),
      "the seven already-refusing positions deny registration before and after",
    ).toEqual(probes.map((c) => [c.row.label, false]));
  });
});

// ===========================================================================
// (p) The seventeenth position — the `match` object-pattern head.
// ===========================================================================

describe("b0262 (p) — the `match` object-pattern head is a control", () => {
  it("b0262-p: the pattern head keeps exactly one unresolved-named-type at both spellings", () => {
    // docs/spec_topics/diagnostics/code-registry-parse.md line 112 states the
    // pattern-head position carries no brace-constructible requirement: the
    // head need only resolve to a same-file `schema` or `enum` declaration, an
    // imported symbol, or a builtin error-model name. An undeclared head
    // resolves to none of those and is refused at HEAD.
    const probes = cells([PATTERN_HEAD]);
    expectCaptured(
      probes.map((c) => c.row),
      [],
    );
    expectRows(
      probes.map((c) => c.row),
      probes.map(() => [UNRESOLVED]),
      () => probes.map((c) => [unresolvedLine(c.head)]),
    );
  });
});

// ===========================================================================
// (i) Case independence — the two spellings differ in no observable.
// ===========================================================================

describe("b0262 (i) — the split is case-independent", () => {
  it("b0262-i: r1, r3, r5 and r9 render structurally identical lists at both spellings", () => {
    // `resolveNamed`'s A–Z read-seam fence (src/parser/type-compat.ts lines 147
    // through 150, bug 0135's §Fix) makes a lowercase head unresolvable BY
    // CONSTRUCTION, and the emitting captures test resolution rather than case.
    // So the lowercase and PascalCase lists must agree once the name bytes are
    // normalised — before the fix (both empty) and after (both one refusal).
    // This cell is the anti-drift lock on bug 0262's §Non-goals: no cell here
    // makes a case-specific claim about a reference position.
    const probed = SILENT_POSITIONS.filter((p) => ["r1", "r3", "r5", "r9"].includes(p.id));
    expect(
      probed.map((p) => p.id),
      "precondition: the four case-independence positions must be present in the table",
    ).toEqual(["r1", "r3", "r5", "r9"]);
    const normalised = probed.map((p) => {
      const lower = p.build("nope");
      const pascal = p.build("Nope");
      const strip = (row: LoadRow, head: string): string[] =>
        row.lines.map((l) => l.split(head).join("<HEAD>"));
      return [p.id, strip(lower, "nope"), strip(pascal, "Nope")] as const;
    });
    expect(
      normalised.map(([id, lower]) => [id, lower]),
      "the lowercase and PascalCase diagnostic lists must be identical apart from the head bytes",
    ).toEqual(normalised.map(([id, , pascal]) => [id, pascal]));
  });
});

// ===========================================================================
// (D1) A builtin error-model name resolves at the four new captures.
// ===========================================================================

describe("b0262 (D1) — `QueryError` is admitted at the four newly covered captures", () => {
  it("b0262-D1: a `Result<T, QueryError>` annotation stays clean of unresolved-named-type", () => {
    // docs/spec_topics/errors-and-results/error-model.md line 61 states thetas
    // may declare functions returning `Result<T, QueryError>` explicitly, and
    // docs/examples/personas.thetalib line 7 spells
    // `fn rate_strictness(a: Author): Result<integer, QueryError> {` at an `fn`
    // RETURN type — one of the four captures this route widens. A widening that
    // read `QueryError` as an ordinary `NamedType` would refuse that committed
    // fixture and red `tests/committed-fixture-parse-gate.test.ts`. GREEN at
    // HEAD and after.
    const rows = [
      theta("D1a — fn return `Result<integer, QueryError>`", 'fn f(): Result<integer, QueryError> { Ok(1) }\n"ok"'),
      theta("D1b — let annotation `Result<string, QueryError>`", 'let a: Result<string, QueryError> = 3\n"ok"'),
      theta("D1c — fn parameter `Result<string, QueryError>`", 'fn f(x: Result<string, QueryError>): number { 1 }\n"ok"'),
    ];
    expectCaptured(rows, []);
    expect(
      rows.map((r) => [r.label, r.codes.filter((c) => c === UNRESOLVED)]),
      "a builtin error-model name resolves; the widening must not refuse it at any of the four new captures",
    ).toEqual(rows.map((r) => [r.label, []]));
    expectRows(rows, [[], [], []], () => [[], [], []]);
  });
});

// ===========================================================================
// (D2) A propagated `let` annotation keeps the `@<T>` arm as sole emitter.
// ===========================================================================

describe("b0262 (D2) — a `let` annotation propagated onto a bare query draws EXACTLY ONE refusal", () => {
  it("b0262-D2: the count stays at one, before and after", () => {
    // `parseLet` (`src/parser/theta-document.ts`) propagates a `let` annotation
    // verbatim onto a bare-query initialiser (src/parser/theta-document.ts
    // lines 2311 and 2319 set `schemaFromLetAnnotation`), so the text reaches
    // the `@<T>` capture and `walkExpr`'s `"query"` arm
    // (src/parser/theta-document.ts line 8820) refuses it there. It is that
    // arm's alone: the comment at src/parser/theta-document.ts lines 8762
    // through 8779 states the sole-emitter disposition bug 0093 settled, and
    // `tests/unresolved-annotation-lowering.test.ts` pins it at its
    // "RED DIRECT-LET" and `RESULT-LET-TYPO` cells. A route that emitted from
    // the `let` capture too would double these lists and red here.
    const rows = [
      theta("D2a — `let r: Tirage = @`x``", "let r: Tirage = @`x`\n\"ok\""),
      theta("D2b — `let r: tirage = @`x``", "let r: tirage = @`x`\n\"ok\""),
      theta("D2c — `let r: Result<Tirage, QueryError> = @`x``", "let r: Result<Tirage, QueryError> = @`x`\n\"ok\""),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      [[UNRESOLVED], [UNRESOLVED], [UNRESOLVED]],
      () => [
        [unresolvedLine("Tirage")],
        [unresolvedLine("tirage")],
        [unresolvedLine("Tirage")],
      ],
    );
  });

  it("b0262-D2-indirect: a ternary branch and an array element are propagating `let` positions too", () => {
    // The `let` capture propagates through more than the DIRECT bare-query
    // initialiser `parseLet` pre-fills. QRY-2 (`resolveQuerySchemas`,
    // `src/parser/query-schema-resolve.ts`) crosses a ternary branch and an
    // array-literal element to carry the binding annotation onto a schema-less
    // query written there — measured, `let r: Tirage = c ? @`a` : @`b`` leaves
    // BOTH branch queries carrying the schema text `Tirage`, and
    // `let rs: array<Tirage> = [@`hi`]` leaves the element query carrying
    // `Tirage` (the array level unwrapped off the sink). Clause (iv)(2) states
    // its rule as a property of the PROPAGATED TEXT, so the `let` capture
    // withholds at these spellings exactly as it does at the direct one and
    // the query arm stays the sole emitter.
    //
    // WHAT THE POSITIONS LOCK. The ternary fixture draws one line PER BRANCH
    // QUERY — `walkExpr`'s unmodified `"query"` arm firing once per query it
    // walks, bug 0093's settled per-query disposition — and the array fixture
    // one for its single element query. All three sit at a query's own
    // columns on source line 6, and NONE at column 1, where the `let`
    // statement starts: a withhold that missed either spelling would add a
    // column-1 line and red here. Measured byte-identical, same lines and same
    // columns, at the pre-fix commit d653d877 in a scratch worktree.
    const rows = [
      theta("D2d — `let r: Tirage = c ? @`a` : @`b``", 'let r: Tirage = true ? @`a` : @`b`\n"ok"'),
      theta("D2e — `let rs: array<Tirage> = [@`hi`]`", 'let rs: array<Tirage> = [@`hi`]\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      [[UNRESOLVED, UNRESOLVED], [UNRESOLVED]],
      () => [
        [unresolvedLine("Tirage"), unresolvedLine("Tirage")],
        [unresolvedLine("Tirage")],
      ],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "clause (iv)(2): every surviving line sits at a query, never at the `let` statement's own column 1",
    ).toEqual([
      [rows[0]?.label, ["6:24", "6:31"]],
      [rows[1]?.label, ["6:26"]],
    ]);
  });
});

// ===========================================================================
// (D3) A reserved-keyword head is REFUSED at the four new captures, wired by
// bug 0274.
// ===========================================================================

describe("b0262 (D3) — a reserved-keyword head is refused, wired by bug 0274", () => {
  it("b0262-D3: `match` as a type head is refused at the four captures, re-vehicled from this report's own tripwire", () => {
    // Bug 0274 §Fix route (a), A-SCOPED (0.272.0): the operator's re-ruling wires
    // the `reservedKeywords` sink at these four sinkless
    // `collectUnresolvedNamedTypes` call sites (among the five its batch
    // names), so a spelling this row's own D3 group used to pin SILENT now
    // draws `theta/parse/reserved-keyword-as-identifier`
    // (docs/spec_topics/diagnostics/code-registry-parse.md line 21) and denies
    // registration, the GOV-15 loads-cleanly reading. The tripwire this group
    // served — that widening this registry row's *Trigger* is outside a §Fix's
    // authorisation — is retained, re-vehicled, as the withheld-spelling
    // silence group (X) of
    // `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts`
    // now pins: `Result`, `array`, `Ok` and `Err` stay silent at these same
    // four positions, so a route that fed the FULL reserved set here would red
    // there instead of here.
    const rows = [
      theta("D3a — let annotation `match`", 'let a: match = 3\n"ok"'),
      theta("D3b — fn parameter `match`", 'fn f(x: match): number { 1 }\n"ok"'),
      theta("D3c — fn return `match`", 'fn f(): match { 3 }\n"ok"'),
      theta("D3d — invoke ascription `match`", 'let r = invoke<match>("./x.theta")\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [RESERVED]),
      () => rows.map(() => [line(RESERVED, [["<keyword>", "match"]])]),
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "each site's keyword refusal sits at the range its site's own sibling name refusal already uses",
    ).toEqual([
      [rows[0]?.label, ["6:1"]],
      [rows[1]?.label, ["6:1"]],
      [rows[2]?.label, ["6:1"]],
      [rows[3]?.label, ["6:9"]],
    ]);
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "an error-severity keyword refusal denies registration at all four captures",
    ).toEqual(rows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (D4) The per-capture guard — one diagnostic per capture.
// ===========================================================================

describe("b0262 (D4) — a capture whose own walk already refused keeps that diagnostic ALONE", () => {
  it("b0262-D4: a position rule and an inline-interior refusal each stand alone", () => {
    // The landed guard shape at src/parser/theta-document.ts lines 8058 through
    // 8063, which the §Fix names as the pattern to follow. `void` at a
    // non-return position is the `let` capture's own position rule; the inline
    // interior's `theta/parse/malformed-schema-field` on an entry the entry
    // walk reaches across a missing separator is the `fn` parameter capture's,
    // and docs/spec_topics/diagnostics/code-registry-parse.md line 107 states
    // that disposition for `fn f(p: {a: b c, d e}): integer { 1 }` — that row
    // ALONE. Neither may gain an unresolved-name line beside it.
    const voidRow = theta("D4a — `let a: void = 3`", 'let a: void = 3\n"ok"');
    const malformed = theta(
      "D4b — `fn f(p: {a: b c, d e}): integer { 1 }`",
      'fn f(p: {a: b c, d e}): integer { 1 }\n"ok"',
    );
    expectCaptured([voidRow, malformed], []);
    expectRows(
      [voidRow, malformed],
      [[VOID_POSITION], [MALFORMED_FIELD]],
      () => [[line(VOID_POSITION)], [line(MALFORMED_FIELD)]],
    );
  });
});

// ===========================================================================
// (n) Negative controls — the checks the silence suppresses, and its bound.
// ===========================================================================

describe("b0262 (n) — a head that RESOLVES still draws its position's verdict", () => {
  it("b0262-n-recovered: the declared twin draws the type-layer mismatch at both recovering positions", () => {
    // The bug document's "What the silence suppresses" table: the only delta
    // from the r1 and r2 fixtures is a declaration of the name. These two cells
    // prove the recovered check is REAL — a route that refused the annotation
    // and then withheld the position's own type layer would red here by
    // dropping the mismatch. Green before the widening and under it.
    const letRow = theta(
      "n1 — declared head at a `let` annotation",
      'schema Nope { a: number }\nlet a: Nope = 3\n"ok"',
    );
    const argRow = theta(
      "n2 — declared head at an `fn` parameter type",
      'schema Nope { a: number }\nfn f(x: Nope): number { 1 }\nlet r = f(3)\n"ok"',
    );
    expectCaptured([letRow, argRow], ["Nope"]);
    expectRows(
      [letRow, argRow],
      [[LET_MISMATCH], [ARG_MISMATCH]],
      () => [
        [
          line(LET_MISMATCH, [
            ["<name>", "a"],
            ["<expected>", "Nope"],
            ["<actual>", "integer"],
          ]),
        ],
        [
          line(ARG_MISMATCH, [
            ["<name>", "f"],
            ["<i>", "0"],
            ["<param>", "x"],
            ["<expected>", "Nope"],
            ["<actual>", "integer"],
          ]),
        ],
      ],
    );
  });

  it("b0262-n-bound: the `fn` return and `invoke<T>` captures decide nothing even when the head resolves", () => {
    // The §Reproduction bound on the claim: at those two captures the position
    // decides nothing with the name declared either, so the widening buys the
    // REFUSAL alone and no recovered check. A route that also started deciding
    // there would red here with a diagnostic the §Fix does not authorise.
    const returnRow = theta(
      "n3 — declared head at an `fn` return type",
      'schema Nope { a: number }\nfn f(): Nope { 3 }\n"ok"',
    );
    const invokeRow = theta(
      "n4 — declared head at an `invoke<T>` ascription",
      'schema Nope { a: number }\nlet r = invoke<Nope>("./x.theta")\n"ok"',
    );
    expectCaptured([returnRow, invokeRow], ["Nope"]);
    expectRows([returnRow, invokeRow], [[], []], () => [[], []]);
    expect(
      [returnRow, invokeRow].map((r) => [r.label, registered(r)]),
      "a resolving head at these two captures keeps the theta registered",
    ).toEqual([returnRow, invokeRow].map((r) => [r.label, true]));
  });
});

// ===========================================================================
// (e) A declared `enum` name resolves at the new captures.
// ===========================================================================

describe("b0262 (e) — a declared `enum` head is not refused", () => {
  it("b0262-e: an `enum` name at a `let` annotation and an `fn` parameter type stays clean", () => {
    // Resolution is whole-file over the body's top-level declarations
    // (docs/spec_topics/diagnostics/code-registry-parse.md line 112), and a
    // top-level `enum` declaration is one of them — `refs.typeNames` carries the
    // name. So an `enum` head resolves at the new captures and the widening must
    // not refuse it. This is the tripwire against a route that consulted only
    // `schema` declarations, which would red here while leaving every group (r)
    // cell green.
    const letRow = theta("e1 — `enum` head at a `let` annotation", 'enum E { A, B }\nlet a: E = E.A\n"ok"');
    const paramRow = theta(
      "e2 — `enum` head at an `fn` parameter type",
      'enum E { A, B }\nfn f(x: E): number { 1 }\n"ok"',
    );
    expectCaptured([letRow, paramRow], ["E"]);
    expectRows([letRow, paramRow], [[], []], () => [[], []]);
    expect(
      [letRow, paramRow].map((r) => [r.label, registered(r)]),
      "a declared `enum` head keeps the theta registered",
    ).toEqual([letRow, paramRow].map((r) => [r.label, true]));
  });
});

// ===========================================================================
// (D5) The `fn`-return -> query propagation withholds at the propagating capture.
// ===========================================================================

/**
 * The 1-indexed start line of each diagnostic in a row, or `"unlocated"` for a
 * diagnostic carrying no range. Read locally so the shared `LoadRow` shape the
 * groups above assert over stays as it is; only the groups below need a
 * position.
 */
function startLines(row: LoadRow): (number | string)[] {
  return row.doc.diagnostics.map((d: Diagnostic) =>
    d.range === undefined ? "unlocated" : d.range.start.line,
  );
}

/**
 * The 1-indexed `line:column` start of each diagnostic in a row, for the cells
 * whose captures sit on ONE source line and are separated by column alone.
 */
function startPositions(row: LoadRow): string[] {
  return row.doc.diagnostics.map((d: Diagnostic) =>
    d.range === undefined ? "unlocated" : `${d.range.start.line}:${d.range.start.column}`,
  );
}

describe("b0262 (D5) — an `fn` return type propagated onto a query draws EXACTLY ONE refusal, AT THE QUERY", () => {
  it("b0262-D5-count-and-position: one line, at the query line, not the `fn` declaration line", () => {
    // The second of the two PROPAGATING captures, and the one the bug
    // document's §Fix names nowhere. `resolveQuerySchemas`
    // (`src/parser/query-schema-resolve.ts`) runs QRY-2 inference after the
    // parse and writes an `fn` return type onto a schema-less query in that
    // function's tail position — measured, the body
    // `fn f(): Tirage { @`hi` }` leaves the tail `QueryExpr` carrying the
    // schema text `Tirage`. The comment at src/parser/theta-document.ts lines
    // 8739 through 8750 states that `walkExpr`'s `"query"` arm is where every
    // route to a schema-bearing query converges — the author-written `@<T>`
    // ascription, `parseLet`'s direct propagation, and this QRY-2 inference
    // alike — so that arm is the sole emitter for the propagated text.
    //
    // WHAT THIS LOCKS, AND WHICH RULING CLAUSE. The operator ruling's clause
    // (iv)(2) settles ONE emission per written annotation at BOTH propagating
    // captures: group (D2) above holds the `let` -> query half, and this group
    // holds the `fn` return -> query half. The bug document's appended
    // §Attempt note, Correction 2, measured the unguarded route drawing TWO
    // lines here, one at the declaration's range and one at the query's, so
    // the count alone is not the whole lock: the surviving line's POSITION
    // separates "the `fn` return capture withheld" from "the query arm went
    // silent and a new declaration-ranged emission replaced it". Both readings
    // hold the count at one.
    //
    // The fixture puts the `fn` declaration at source line 6 and the query at
    // source line 7 — five frontmatter lines and one blank precede the body —
    // so the position assertion below reads directly which capture spoke.
    // Green before the widening and under it.
    const rows = [
      theta("D5a — `fn f(): Tirage` over a query body", "fn f(): Tirage {\n  @`hi`\n}\nlet r = f()\n\"ok\""),
      theta("D5b — `fn f(): tirage` over a query body", "fn f(): tirage {\n  @`hi`\n}\nlet r = f()\n\"ok\""),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      [[UNRESOLVED], [UNRESOLVED]],
      () => [[unresolvedLine("Tirage")], [unresolvedLine("tirage")]],
    );
    expect(
      rows.map((r) => [r.label, startLines(r)]),
      "clause (iv)(2): the query arm is the sole emitter for propagated text, so the one surviving line sits at the query (source line 7), not at the `fn` declaration (source line 6)",
    ).toEqual(rows.map((r) => [r.label, [7]]));
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "the refusal is error-severity, so neither fixture registers",
    ).toEqual(rows.map((r) => [r.label, false]));
  });

  it("b0262-D5-declared: the declared twin draws nothing at either capture", () => {
    // The anti-vacuity half of the cell above: the ONLY delta is a declaration
    // of the name, and the list empties. A route that emitted a
    // declaration-ranged line for a RESOLVING return type reds here; a route
    // that broke the propagation itself reds in the cell above by moving the
    // position rather than here.
    const declared = theta(
      "D5c — declared `Tirage` at an `fn` return over a query body",
      "schema Tirage { a: number }\nfn f(): Tirage {\n  @`hi`\n}\nlet r = f()\n\"ok\"",
    );
    expectCaptured([declared], ["Tirage"]);
    expectRows([declared], [[]], () => [[]]);
    expect(
      [[declared.label, registered(declared)]],
      "a resolving return type keeps the theta registered",
    ).toEqual([[declared.label, true]]);
  });

  it("b0262-D5-return-statement: a `return <query>` operand is a propagating capture too", () => {
    // The `fn`-return QRY-2 sink writes onto EVERY return position of the
    // body, not the tail alone: `rewriteFnBlock` / `rewriteReturnAware`
    // (`src/parser/query-schema-resolve.ts`) thread the declared-return sink
    // into each `return` operand as well, at any control-flow depth. A
    // withhold that inspected the tail alone would let this spelling escape
    // and draw TWO lines for the ONE annotation the author wrote — exactly the
    // double emission the bug document's §Attempt note, Correction 2 measured,
    // and exactly what clause (iv)(2) forbids.
    //
    // The fixture puts the `fn` declaration at source line 6 and the `return`
    // at source line 7, so the position assertion reads directly which capture
    // spoke: the surviving line must sit AT THE QUERY, as in the tail-bodied
    // cell above. Both spellings, for case independence.
    const rows = [
      theta(
        "D5f — `fn f(): Tirage` over a `return <query>` body",
        'fn f(): Tirage {\n  return @`hi`\n}\nlet r = f()\n"ok"',
      ),
      theta(
        "D5g — `fn f(): tirage` over a `return <query>` body",
        'fn f(): tirage {\n  return @`hi`\n}\nlet r = f()\n"ok"',
      ),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      [[UNRESOLVED], [UNRESOLVED]],
      () => [[unresolvedLine("Tirage")], [unresolvedLine("tirage")]],
    );
    expect(
      rows.map((r) => [r.label, startLines(r)]),
      "clause (iv)(2): the query arm is the sole emitter for text propagated onto a `return` operand too, so the one surviving line sits at the query (source line 7), not at the `fn` declaration (source line 6)",
    ).toEqual(rows.map((r) => [r.label, [7]]));
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "the refusal is error-severity, so neither fixture registers",
    ).toEqual(rows.map((r) => [r.label, false]));
  });

  it("b0262-D5-result: a `Result<T, QueryError>` return admits the error-model name and never doubles", () => {
    // Clause (iv)(1) meets clause (iv)(2) at one fixture. QRY-2 inference
    // propagates a BARE named return type onto a return-position query (the
    // two cells above) and does NOT propagate the
    // `Result<Tirage, QueryError>` spelling — that query's schema stays null —
    // so this capture is not a propagating one for this text and clause
    // (iv)(2)'s withhold does not reach it.
    //
    // WHY THIS CELL IS BOUNDED WHERE THE OTHERS ARE WHOLE-LIST. Two
    // observables are settled by the ruling and both are asserted: no line
    // names the builtin error-model name (clause (iv)(1)), and one written
    // annotation draws at most one refusal (clause (iv)(2)). The THIRD
    // question — whether the `Tirage` interior of a non-propagated `Result`
    // return draws its refusal at the declaration or nowhere — is row r8's
    // subject, and group (r) carries it whole-list at
    // `fn f(): Result<nope, string>`. Keeping this cell bounded is what stops
    // the two groups pinning the same question twice from two authorities. The
    // bound is what the ruling settles, and it holds in both directions.
    const rows = [
      theta(
        "D5d — `fn f(): Result<Tirage, QueryError>` over a query body",
        "fn f(): Result<Tirage, QueryError> {\n  @`hi`\n}\nlet r = f()\n\"ok\"",
      ),
      theta(
        "D5e — `fn f(): Result<tirage, QueryError>` over a query body",
        "fn f(): Result<tirage, QueryError> {\n  @`hi`\n}\nlet r = f()\n\"ok\"",
      ),
    ];
    expectCaptured(rows, []);
    expect(
      rows.map((r) => [r.label, r.lines.filter((l) => l.includes("QueryError"))]),
      "clause (iv)(1): a builtin error-model name is admitted at the `fn` return capture, so no diagnostic names it",
    ).toEqual(rows.map((r) => [r.label, []]));
    expect(
      rows.map((r) => [r.label, r.codes.filter((c) => c === UNRESOLVED).length <= 1]),
      "clause (iv)(2): one written annotation draws at most one refusal; the §Attempt note's Correction 2 measured two",
    ).toEqual(rows.map((r) => [r.label, true]));
  });

  it("b0262-D5-two-queries: two return-position queries under ONE return-type annotation draw one line PER QUERY, not per annotation", () => {
    // BYTE-STABILITY CONTROL, not a claim about the desired end state. The
    // propagating `fn` return capture WITHHOLDS here exactly as the cells
    // above assert — no line sits at the `fn` declaration line — which is what
    // ruling clause (iv)(2) settles for ONE query. This fixture instead has
    // TWO DISTINCT return-position query expressions under the one written
    // annotation, an `if`-guarded early return plus a tail return, so it draws
    // two lines: one PER QUERY EXPRESSION, from `walkExpr`'s unmodified
    // `"query"` arm firing once per query it walks, as it already did for
    // every other cell in this group. That per-query multiplicity is bug
    // 0093's settled disposition and this change-set's diff touches no hunk of
    // that arm's emission, so it is unmodified here too. Measured
    // byte-identical — same two source lines — at the pre-fix commit
    // d653d877 in a scratch worktree; a change to the per-query count is bug
    // 0093's subject, not this bug's.
    //
    // A red here means a widening leaked a THIRD emission back onto the `fn`
    // return capture (an annotation-level line beside the two query-level
    // ones), or collapsed the two query-level lines into one and thereby broke
    // the per-query disposition this cell locks byte-stable. The fixture puts
    // the `fn` declaration at source line 6, the `if`-guarded query at source
    // line 8 and the tail query at source line 10, so the position assertion
    // below reads directly that neither line sits at the declaration.
    const rows = [
      theta(
        "D5h — `fn f(): Tirage` over an `if`-guarded return query and a tail return query",
        "fn f(): Tirage {\n  if true {\n    return @`hi`\n  }\n  return @`bye`\n}",
      ),
      theta(
        "D5i — `fn f(): tirage` over an `if`-guarded return query and a tail return query",
        "fn f(): tirage {\n  if true {\n    return @`hi`\n  }\n  return @`bye`\n}",
      ),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      [
        [UNRESOLVED, UNRESOLVED],
        [UNRESOLVED, UNRESOLVED],
      ],
      () => [
        [unresolvedLine("Tirage"), unresolvedLine("Tirage")],
        [unresolvedLine("tirage"), unresolvedLine("tirage")],
      ],
    );
    expect(
      rows.map((r) => [r.label, startLines(r)]),
      "one line per query expression (source lines 8 and 10), and NONE at the `fn` declaration (source line 6): the propagating capture withholds, and the two surviving lines are the unmodified query arm's pre-existing per-query disposition",
    ).toEqual(rows.map((r) => [r.label, [8, 10]]));
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "both refusals are error-severity, so neither fixture registers",
    ).toEqual(rows.map((r) => [r.label, false]));
  });

  it("b0262-D5-indirect: an array element under an `array<T>` return type is a propagating position too", () => {
    // QRY-2's `fn`-return sink is not confined to a query written AS the
    // return position: `rewriteExpr` (`src/parser/query-schema-resolve.ts`)
    // crosses an array literal, so `fn f(): array<Tirage> { [@`hi`] }` leaves
    // the ELEMENT query carrying the schema text `Tirage` — one `array<T>`
    // level unwrapped off the sink, which is why the propagated text and the
    // written annotation are DIFFERENT spellings. A withhold keyed on the two
    // texts being equal cannot see this case, and the annotation would draw a
    // second line beside the query's. The withhold is read off the pass that
    // performs the propagation instead, so the crossed constructs are stated
    // once.
    //
    // The fixture puts the `fn` declaration at source line 6 and the element
    // query at source line 7, so the position assertion reads which capture
    // spoke. Measured byte-identical — one line, same position — at the
    // pre-fix commit d653d877 in a scratch worktree.
    const rows = [
      theta(
        "D5j — `fn f(): array<Tirage>` over an array-literal query body",
        "fn f(): array<Tirage> {\n  [@`hi`]\n}\nlet r = f()\n\"ok\"",
      ),
      theta(
        "D5k — `fn f(): array<tirage>` over an array-literal query body",
        "fn f(): array<tirage> {\n  [@`hi`]\n}\nlet r = f()\n\"ok\"",
      ),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      [[UNRESOLVED], [UNRESOLVED]],
      () => [[unresolvedLine("Tirage")], [unresolvedLine("tirage")]],
    );
    expect(
      rows.map((r) => [r.label, startLines(r)]),
      "clause (iv)(2): the one surviving line sits at the element query (source line 7), not at the `fn` declaration (source line 6)",
    ).toEqual(rows.map((r) => [r.label, [7]]));
  });

  it("b0262-D5-param: an `fn` PARAMETER type carried onto a call-argument query is a propagating capture", () => {
    // The THIRD propagating capture, and the one the ruling's enumeration does
    // not name. QRY-2's call-argument sink (`callArgFrame`,
    // `src/parser/query-schema-resolve.ts`) resolves a call to a local `fn` to
    // that function's declared parameter type and carries it onto a
    // schema-less query written as the argument — measured,
    // `fn h(x: Tirage): number { 1 }` plus `let r = h(@`hi`)` leaves the
    // argument query carrying the schema text `Tirage`. Clause (iv)(2) states
    // its rule as a property of the propagated TEXT, so the parameter capture
    // withholds and the query arm stays the sole emitter for it; a route that
    // emitted at the declaration as well would draw TWO lines for the ONE
    // annotation the author wrote, which is what this cell reds on.
    //
    // The fixture puts the `fn` declaration at source line 6 and the call at
    // source line 7. Measured byte-identical — one line, same position — at
    // the pre-fix commit d653d877 in a scratch worktree, where the parameter
    // capture emitted nothing at all.
    const rows = [
      theta(
        "D5l — `fn h(x: Tirage)` called with a bare query argument",
        'fn h(x: Tirage): number { 1 }\nlet r = h(@`hi`)\n"ok"',
      ),
      theta(
        "D5m — `fn h(x: tirage)` called with a bare query argument",
        'fn h(x: tirage): number { 1 }\nlet r = h(@`hi`)\n"ok"',
      ),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      [[UNRESOLVED], [UNRESOLVED]],
      () => [[unresolvedLine("Tirage")], [unresolvedLine("tirage")]],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "clause (iv)(2): the one surviving line sits at the argument query (source line 7, column 11), not at the `fn` declaration (source line 6)",
    ).toEqual(rows.map((r) => [r.label, ["7:11"]]));
    // The anti-vacuity half: the only delta is a declaration of the name, and
    // the list empties, so the line above is the refusal and not some other
    // verdict the fixture would draw regardless.
    const declared = theta(
      "D5n — declared `Tirage` at a propagating parameter",
      'schema Tirage { a: number }\nfn h(x: Tirage): number { 1 }\nlet r = h(@`hi`)\n"ok"',
    );
    expectCaptured([declared], ["Tirage"]);
    expectRows([declared], [[]], () => [[]]);
  });
});

// ===========================================================================
// (D6) Artefact spellings the captures absorb are SUPPRESSED.
// ===========================================================================

describe("b0262 (D6) — a capture artefact draws no refusal of its own", () => {
  it("b0262-D6: the unclosed parameter list and the unbraced `fn` body keep their lists byte-identical", () => {
    // Clause (iv)(3) of the operator ruling, and the bug document's appended
    // §Attempt note, Correction 3: the annotation captures absorb trailing
    // text, so text the author never wrote as a type name arrives
    // `Ident`-shaped at the widened capture. `fn h(a: string` followed by
    // `let x = 1` captures the artefact spelling `stringletx` at the parameter
    // read (src/parser/theta-document.ts line 8172), and `fn f(): number 1`
    // captures `number1` at the return read (src/parser/theta-document.ts line
    // 8213). Neither spelling is a name the author wrote.
    //
    // THE SETTLED PREDICATE. The ruling withholds the new emission when the
    // capture's source window is already covered by an error-severity
    // diagnostic naming the real fault — the generalization of the landed
    // per-capture guard shape at src/parser/theta-document.ts lines 8058
    // through 8063, which tests one capture's OWN walk rather than the window.
    // Both fixtures below satisfy the predicate: every diagnostic they draw
    // names the real fault — an unbraced body, an unclosed parameter list —
    // and sits inside the capture window the artefact was absorbed from,
    // source line 6 in each. That window is the `fn` declaration HEADER, and
    // for D6a — whose parameter list never closed, so the parser recovered no
    // body at all — the whole declaration. One written mistake draws one
    // diagnostic naming it. The group (D6 cont.) below fences the other side
    // of that window.
    //
    // The two fixtures are the ones bug 0151's witness
    // (`tests/fn-param-list-unclosed.test.ts`) and bug 0249's witness
    // (`tests/reserved-keyword-inline-object-and-literal-keys.test.ts`) pin;
    // this cell is the tripwire against a widening that refuses capture debris
    // and reds them both. Green before the widening and under it.
    const unclosed = theta(
      "D6a — `fn h(a: string` + `let x = 1` (captures `stringletx`)",
      'fn h(a: string\nlet x = 1\n"ok"',
    );
    const unbraced = theta(
      "D6b — `fn f(): number 1` (captures `number1`)",
      'fn f(): number 1\n"ok"',
    );
    expectCaptured([unclosed, unbraced], []);
    expectRows(
      [unclosed, unbraced],
      [[SINGLE_LINE_IF, PARAM_LIST_UNCLOSED], [SINGLE_LINE_IF]],
      () => [
        [line(SINGLE_LINE_IF), line(PARAM_LIST_UNCLOSED)],
        [line(SINGLE_LINE_IF)],
      ],
    );
    expect(
      [unclosed, unbraced].map((r) => [r.label, startLines(r)]),
      "the naming diagnostics sit at the same source line as the capture that absorbed the artefact, which is why the ruling's suppression predicate holds for both fixtures",
    ).toEqual([
      [unclosed.label, [6, 6]],
      [unbraced.label, [6]],
    ]);
    expect(
      [unclosed, unbraced].map((r) => [r.label, registered(r)]),
      "both fixtures already carry an error-severity refusal, so neither registers before or after",
    ).toEqual([unclosed, unbraced].map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (D6 cont.) The suppression is bounded to the CAPTURE's own window.
// ===========================================================================

describe("b0262 (D6 cont.) — a fault outside the capture's window leaves the refusal standing", () => {
  it("b0262-D6-window: a same-line stray token and a body-interior lexer fault each keep BOTH diagnostics", () => {
    // The other half of clause (iv)(3). The clause suppresses "capture debris
    // from other syntax errors" — an `Ident`-shaped spelling the capture
    // ABSORBED, as in group (D6) above. It does not suppress a name the author
    // WROTE merely because some unrelated fault shares the statement. Two
    // written mistakes draw two diagnostics; one written mistake draws one.
    //
    // The two fixtures are the boundary cases a statement-span predicate would
    // over-suppress, and each is the near miss of a (D6) fixture:
    //
    //   D6c — a stray `)` on the SAME LINE as the `let`, but ranged PAST the
    //   statement's own end. The author wrote `Nope`; the stray token is a
    //   second, independent mistake.
    //
    //   D6d — an unterminated string INSIDE the `fn` body, several lines below
    //   the header the parameter type is absorbed from. The `fn` statement's
    //   range spans the whole body, so only a HEADER-scoped window keeps the
    //   parameter's refusal alive here.
    //
    // The position assertions below are what make the reading attributable:
    // D6c's two lines sit on the same source line and are separated by column,
    // D6d's two sit on different source lines.
    const stray = theta("D6c — `let a: Nope = 3 )` (a stray token past the statement)", 'let a: Nope = 3 )\n"ok"');
    const interior = theta(
      "D6d — `fn f(x: Nope)` with an unterminated string in the body",
      'fn f(x: Nope): number {\n  let y = "unterminated\n  1\n}\n"ok"',
    );
    expectCaptured([stray, interior], []);
    expectRows(
      [stray, interior],
      [
        [UNRESOLVED, UNSUPPORTED_FEATURE],
        [UNRESOLVED, LITERAL_NEWLINE],
      ],
      () => [
        [
          unresolvedLine("Nope"),
          line(UNSUPPORTED_FEATURE, [["<construct>", "stray ')' in statement position"]]),
        ],
        [unresolvedLine("Nope"), line(LITERAL_NEWLINE)],
      ],
    );
    expect(
      [stray, interior].map((r) => [r.label, startLines(r)]),
      "D6c's stray token shares the `let`'s source line and is excluded by COLUMN; D6d's lexer fault sits two lines below the `fn` header the parameter type is absorbed from",
    ).toEqual([
      [stray.label, [6, 6]],
      [interior.label, [6, 7]],
    ]);
    expect(
      [stray, interior].map((r) => [r.label, registered(r)]),
      "both fixtures carry error-severity refusals, so neither registers",
    ).toEqual([stray, interior].map((r) => [r.label, false]));
  });

  it("b0262-D6-initialiser: a fault inside the initialiser or the argument list leaves both heads standing", () => {
    // The same bound, read on the INITIALISER side. A `let` annotation is
    // absorbed from the text ahead of its initialiser and an `invoke<T>`
    // ascription from the text ahead of its argument list, so nothing written
    // in an initialiser or an argument can be debris the capture swallowed.
    // A fault there is a second, independent author mistake, and the head the
    // author wrote keeps its own refusal beside it.
    //
    //   D6e — an `invoke` path that is not a `.theta` file, inside the
    //   argument list of an initialiser. Three written mistakes, three
    //   diagnostics: the `let` head, the ascription head, and the path.
    //
    //   D6f — an unterminated string AS the initialiser. The lexer fault is
    //   ranged at the initialiser's own start, the first position outside the
    //   `let` capture's window, so the exclusive end of that window is what
    //   this cell reads.
    //
    //   D6g — an initialiser-interior fault raised by the SAME structural walk
    //   as the refusal rather than by an earlier pass. The disposition is the
    //   window's, not the raising pass's: both diagnostics stand here for the
    //   same reason they stand in D6e and D6f.
    //
    // The position assertions read WHICH capture spoke: every diagnostic below
    // sits on source line 6 and the captures are separated by column alone.
    const invokeArg = theta(
      "D6e — `let a: Nope = invoke<Gone>(\"other\", 1)` (a non-`.theta` path)",
      'let a: Nope = invoke<Gone>("other", 1)\n"ok"',
    );
    const unterminated = theta(
      "D6f — `let a: Nope = \"abc` (an unterminated string initialiser)",
      'let a: Nope = "abc\n"ok"',
    );
    const bareObject = theta(
      "D6g — `let a: Nope = { b: 1 }.b` (a same-walk initialiser fault)",
      'let a: Nope = { b: 1 }.b\n"ok"',
    );
    const initialiserRows = [invokeArg, unterminated, bareObject];
    expectCaptured(initialiserRows, []);
    expectRows(
      initialiserRows,
      [
        [UNRESOLVED, UNRESOLVED, INVOKE_NON_THETA],
        [UNRESOLVED, LITERAL_NEWLINE],
        [UNRESOLVED, BARE_OBJECT],
      ],
      () => [
        [
          unresolvedLine("Nope"),
          unresolvedLine("Gone"),
          line(INVOKE_NON_THETA, [["<path>", "other"]]),
        ],
        [unresolvedLine("Nope"), line(LITERAL_NEWLINE)],
        [unresolvedLine("Nope"), line(BARE_OBJECT)],
      ],
    );
    expect(
      initialiserRows.map((r) => [r.label, startPositions(r)]),
      "column 1 is the `let` capture, column 15 the initialiser's own start (the `invoke` ascription in D6e, the lexer fault in D6f, the bare object in D6g), column 28 the path argument",
    ).toEqual([
      [invokeArg.label, ["6:1", "6:15", "6:28"]],
      [unterminated.label, ["6:1", "6:15"]],
      [bareObject.label, ["6:1", "6:15"]],
    ]);
    expect(
      initialiserRows.map((r) => [r.label, registered(r)]),
      "every fixture carries error-severity refusals, so none registers",
    ).toEqual(initialiserRows.map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (D8) A nested capture keeps its own refusal beside the enclosing one.
// ===========================================================================

describe("b0262 (D8) — an enclosing capture's refusal does not swallow a nested capture's", () => {
  it("b0262-D8: two written heads at nested captures draw TWO refusals, one naming each", () => {
    // The bound on clause (iv)(3), from the other side than group (D6 cont.).
    // The clause suppresses ARTEFACT spellings — capture debris — when the
    // window is already covered by a diagnostic NAMING THE REAL FAULT. A
    // refusal of an enclosing capture's head names that head and says nothing
    // about the nested capture's own written head, so it is no such cover:
    // one written mistake draws one diagnostic naming it, and two written
    // mistakes draw two.
    //
    // Both fixtures put an enclosing capture whose range SPANS the nested one:
    //
    //   D8a — the `fn` parameter and return captures emit at the whole
    //   DECLARATION's range, source lines 6 through 9, which contains the
    //   `let` statement in the body at source line 7.
    //
    //   D8b — the `let` capture emits at the whole STATEMENT's range, which
    //   contains the `invoke<T>` ascription written in its initialiser.
    //
    // The position assertions read which capture spoke: D8a's two lines sit on
    // different source lines, D8b's two on one source line at different
    // columns. Both spellings, for case independence.
    const nestedLet = [
      theta(
        "D8a — `fn f(x: Nope)` over a body declaring `let y: AlsoNope`",
        'fn f(x: Nope): number {\n  let y: AlsoNope = 1\n  1\n}\n"ok"',
      ),
      theta(
        "D8b — `fn f(x: nope)` over a body declaring `let y: alsonope`",
        'fn f(x: nope): number {\n  let y: alsonope = 1\n  1\n}\n"ok"',
      ),
    ];
    const nestedInvoke = [
      theta(
        "D8c — `let x: Nope = invoke<AlsoNope>(…)`",
        'let x: Nope = invoke<AlsoNope>("./x.theta")\n"ok"',
      ),
      theta(
        "D8d — `let x: nope = invoke<alsonope>(…)`",
        'let x: nope = invoke<alsonope>("./x.theta")\n"ok"',
      ),
    ];
    expectCaptured([...nestedLet, ...nestedInvoke], []);
    expectRows(
      [...nestedLet, ...nestedInvoke],
      [
        [UNRESOLVED, UNRESOLVED],
        [UNRESOLVED, UNRESOLVED],
        [UNRESOLVED, UNRESOLVED],
        [UNRESOLVED, UNRESOLVED],
      ],
      () => [
        [unresolvedLine("Nope"), unresolvedLine("AlsoNope")],
        [unresolvedLine("nope"), unresolvedLine("alsonope")],
        [unresolvedLine("Nope"), unresolvedLine("AlsoNope")],
        [unresolvedLine("nope"), unresolvedLine("alsonope")],
      ],
    );
    expect(
      [...nestedLet, ...nestedInvoke].map((r) => [r.label, startPositions(r)]),
      "the enclosing capture speaks at its own declaration start and the nested one at its own: neither line is the other's",
    ).toEqual([
      [nestedLet[0]?.label, ["6:1", "7:3"]],
      [nestedLet[1]?.label, ["6:1", "7:3"]],
      [nestedInvoke[0]?.label, ["6:1", "6:15"]],
      [nestedInvoke[1]?.label, ["6:1", "6:15"]],
    ]);
    expect(
      [...nestedLet, ...nestedInvoke].map((r) => [r.label, registered(r)]),
      "both refusals are error-severity, so none of the four registers",
    ).toEqual([...nestedLet, ...nestedInvoke].map((r) => [r.label, false]));
  });

  it("b0262-D8-controls: with the enclosing head DECLARED, the nested refusal is byte-identical", () => {
    // The anti-vacuity half. Each control changes the enclosing capture's head
    // to a resolving one and changes nothing else, so the nested capture's
    // line must survive unmoved — same code, same message, same position. A
    // swallow shows up as this line being present in the control and absent in
    // the cell above; these two rows are what makes that comparison exact.
    const controls = [
      theta(
        "D8e — `fn f(x: number)` over a body declaring `let y: AlsoNope`",
        'fn f(x: number): number {\n  let y: AlsoNope = 1\n  1\n}\n"ok"',
      ),
      theta(
        "D8f — `let x: number = invoke<AlsoNope>(…)`",
        'let x: number = invoke<AlsoNope>("./x.theta")\n"ok"',
      ),
    ];
    expectCaptured(controls, []);
    expectRows(
      controls,
      [[UNRESOLVED], [UNRESOLVED]],
      () => [[unresolvedLine("AlsoNope")], [unresolvedLine("AlsoNope")]],
    );
    expect(
      controls.map((r) => [r.label, startPositions(r)]),
      "the nested capture speaks at its own position whether or not the enclosing head resolves; only the columns move with the shorter head text",
    ).toEqual([
      [controls[0]?.label, ["7:3"]],
      [controls[1]?.label, ["6:17"]],
    ]);
  });
});

// ===========================================================================
// (D7) The shipped corpus file the admission exists for.
// ===========================================================================

/** The shipped `.thetalib` the operator ruling's clause (iv)(1) names by path. */
const PERSONAS_PATH = "docs/examples/personas.thetalib";

describe("b0262 (D7) — the shipped `.thetalib` keeps loading under the widening", () => {
  it("b0262-D7: `docs/examples/personas.thetalib` draws zero unresolved-named-type", () => {
    // Clause (iv)(1) over the real bytes, not a synthetic twin. Group (D1)
    // above covers `Result<T, QueryError>` at three synthetic captures; the
    // ruling additionally names this shipped file, because the bug document's
    // §Attempt note, Correction 1, measured that §Reproduction's corpus sweep
    // missed it. The file spells an `fn` RETURN type carrying `QueryError`,
    // one of the four widened captures, and `collectUnresolvedNamedTypes`
    // (`src/parser/body-type-lowering.ts`) answers with that name against any
    // declaration set, so a widening without the admission refuses a committed
    // fixture and reds `tests/committed-fixture-parse-gate.test.ts`.
    //
    // The pipeline is that gate's: `lexTheta` then `parseThetaDocument` over
    // the file's own bytes and its own path string, because the parser keys
    // its `.thetalib` dispatch off the extension in that string. Both entry
    // points are reached here through the shipped wrappers `lexBytes` and
    // `parseDocBytes` (`tests/helpers/e2e-s1.ts`), which supply the same inert
    // offline deps `makeDeps` supplies there and stub no behaviour.
    //
    // SCOPE. This cell asserts the clause the ruling settles — zero refusals
    // of the error-model name — and not the whole-list zero-diagnostic claim,
    // which is `tests/committed-fixture-parse-gate.test.ts`'s subject over the
    // whole corpus.
    const bytes = new Uint8Array(
      readFileSync(fileURLToPath(new URL(`../${PERSONAS_PATH}`, import.meta.url))),
    );
    const text = new TextDecoder().decode(bytes);
    const returnTypes = [...text.matchAll(/^fn\s+[^(]+\([^)]*\)\s*:\s*([^{]+)\{/gm)].map((m) =>
      (m[1] ?? "").trim(),
    );
    expect(
      returnTypes.filter((t) => t.includes("QueryError")),
      `precondition: ${PERSONAS_PATH} must still spell an \`fn\` return type carrying the builtin error-model name; without it this cell asserts nothing about clause (iv)(1), and the fixture is re-chosen rather than skipped`,
    ).not.toEqual([]);

    const parsed = parseDocBytes(bytes, PERSONAS_PATH);
    const lexed = lexBytes(bytes, PERSONAS_PATH);
    const all: readonly Diagnostic[] = [...lexed.diagnostics, ...parsed.diagnostics];
    expect(
      parsed.body.statements.map((s) => s.kind),
      `precondition: ${PERSONAS_PATH} must parse to the declarations that carry the return type under test`,
    ).toEqual(["schema", "fn"]);
    expect(
      all.filter((d: Diagnostic) => d.code === UNRESOLVED).map((d: Diagnostic) => d.message),
      `clause (iv)(1): the builtin error-model name is admitted at the four widened captures, so the shipped ${PERSONAS_PATH} draws no refusal`,
    ).toEqual([]);
  });
});
