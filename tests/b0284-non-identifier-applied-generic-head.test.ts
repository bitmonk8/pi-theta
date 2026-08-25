import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0284 — a generic head that is NOT identifier-shaped (`a b<integer>`,
// `Nope.Sub<integer>`, `a-b<integer>`, `f()<integer>`, `1x<integer>`) is
// admitted with no diagnostic at five type-reference captures, and the theta
// registers with the field lowered permissively
// (docs/bugs/0284-non-identifier-applied-generic-head-silent-at-five-captures.md).
//
// THE SEAM, one arm and two sinks. `lowerTypeExpr`'s generic-application arm
// tests only WHERE the `<` sits (`const lt = s.indexOf("<")`,
// src/parser/params.ts line 770) and slices whatever precedes it as the head
// (`const ctor = s.slice(0, lt).trim()`, line 772). Three gates then judge that
// head: the `array` arity-1 branch (line 791), bug 0281's reserved-head gate
// (line 795), and bug 0282's landed closed-set gate (line 809,
// `!(ctor in GENERIC_ARITY) && IDENTIFIER.test(ctor)`, with `IDENTIFIER` =
// `/^[A-Za-z_][A-Za-z0-9_]*$/` at line 666). A head that fails `IDENTIFIER`
// passes all three and reaches the permissive catch-all (lines 861–878), which
// walks the arguments for their side effects and returns `{}` having pushed the
// head onto NO sink. The not-expression family's own sink is written from ONE
// place in this function — `lowerCtx.unspellable?.push(s)` at line 962, below
// `// Atom.` (line 881) — which an applied spelling never reaches, because the
// generic-application arm returned first at line 878. Both readers of that sink
// then answer accordingly: the `params:` reader filters an empty list
// (`unspellable.filter(isUnspellableTextRefusable)`, line 263; the emission at
// line 313) and `annotationSourceIsNotTypeExpression`
// (src/parser/type-layer-checks.ts line 1266, verdict at lines 1285–1286)
// returns `false`. Zero sink entries means zero diagnostics, and zero
// diagnostics means the theta REGISTERS.
//
// WHY THE SPELLING IS ILLEGAL, from the grammar rather than from taste. `Type`
// has six alternatives (docs/spec_topics/grammar.md lines 90–95); `GenericType`
// has two productions, each spelling its own head (lines 99–100), and line 107
// closes the set — "No other identifier is parameterisable". `NamedType ::=
// Ident` (line 98) admits none of `a b`, `Nope.Sub`, `a-b`, `f()` or `1x` even
// BARE. No production derives any of them, applied or unapplied, so
// grammar.md line 105 (for the body captures) and
// docs/spec_topics/frontmatter/frontmatter-fields-a.md line 58 (for `params:`)
// assign the text to the not-expression family by position.
//
// THE ROUTE THIS FILE ENCODES — bug 0284 §Fix, with the §Fix sub-choice
// ADJUDICATED to candidate (i): after bug 0282's closed-set gate and before the
// permissive catch-all, a head that is in no `GENERIC_ARITY` entry, is no
// reserved spelling and is NOT identifier-shaped pushes the HEAD TEXT (`a b`
// from `a b<integer>`) onto `lowerCtx.unspellable` and returns `{}`. The two
// gates then partition the non-derivable applied heads between the two
// registered families by the same identifier test that today decides between
// refusal and silence. No code is minted: the sink renders as
// `theta/load/params-type-not-expression` at `params:`
// (docs/spec_topics/diagnostics/code-registry-load.md line 20),
// `theta/parse/annotation-type-not-expression` at a `let` annotation, an `fn`
// parameter type and an `fn` return type (code-registry-parse.md line 107),
// `theta/parse/query-annotation-type-not-expression` at the `@<T>` ascription
// (line 108), and `theta/parse/schema-type-not-expression` at a `schema` field
// type (line 106).
//
// WHAT THE SUB-CHOICE COSTS, and where this file pins it: group (S). The head
// text is BRACE-FREE BY CONSTRUCTION, so the shared decline
// `isUnspellableTextRefusable` (src/parser/params.ts lines 1825–1826:
// `parseLiteralArm(text) === undefined && !text.includes("{") &&
// !text.includes("}")`) never declines it, and `p: 'a b<{x: integer}>'`
// REFUSES. The rejected candidate (ii), pushing the WHOLE application text,
// would have that same fragment declined by the brace exemption and would leave
// that spelling silent — measured in bug 0284 §Reproduction's decline block
// (`isUnspellableTextRefusable("a b<{x: integer}>")` is `false`). Group (S) is
// therefore the cell that discriminates the two candidates, and it reds under
// (ii) while every other subject cell greens.
//
// WHAT MOVES AND WHAT MUST NOT. Groups (P), (S), (N) and (B) assert a refusal
// where HEAD produces an EMPTY diagnostic list and a registered theta — that is
// the filed red. Groups (X) and (C) are measured green before and after: the
// two spellings the bug document's §Non-goals removes from the body-capture
// subject keep the readings they already draw (`a b<integer>` token-joins to
// the identifier head `ab` and draws bug 0282's landed refusal; `1x<integer>`
// is a LEXER refusal), and bug 0282's `Nope<integer>`, bug 0281's
// `Ok<integer>`, the empty-head control `' <integer>'`, the closed set's
// `array<integer>` / `Result<T, E>` and the bare `a b` are byte-unchanged.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (tests/helpers/e2e-s1.ts — the shipped whole-file entry point wrapped in inert
// deps, no behaviour stubbed). An integration tier would add a round trip to a
// value already fixed at the parse boundary and observe nothing sharper; a live
// tier cannot see a diagnostic LIST at all, only the registration outcome it
// implies, which the companion live cell
// (tests/live/b0284live-non-identifier-applied-generic-head.test.ts) covers.
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
// diagnostic nor one at the wrong capture can hide, and the subject cells
// assert the LOWERED FRAGMENT beside the codes, because the silent admission's
// own signature is a lowered `{}` standing where a type was written. `Nope`,
// `Nope.Sub`, `a b`, `a-b`, `f` and `Ghost` are declared and imported nowhere.

// ===========================================================================
// The diagnostic oracle — the registries' *Message* columns (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";
const LOAD_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-load.md";

function readRegistry(relativePath: string): RegistryRow[] {
  return parseRegistry(
    readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8"),
  ) as RegistryRow[];
}

const PARSE_REGISTRY = readRegistry(PARSE_REGISTRY_PATH);
const LOAD_REGISTRY = readRegistry(LOAD_REGISTRY_PATH);

/** The `params:` member of the not-expression family — this bug's subject code there. */
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";
/** The `let` / `fn`-parameter / `fn`-return member of the same family. */
const ANNOT_NOT_EXPR = "theta/parse/annotation-type-not-expression";
/** The `@<T>` query-ascription member; its Message is placeholder-free. */
const QUERY_NOT_EXPR = "theta/parse/query-annotation-type-not-expression";
/** The `schema` field-type / alias-arm member. */
const SCHEMA_NOT_EXPR = "theta/parse/schema-type-not-expression";
/** Bug 0282's landed row for an IDENTIFIER-shaped applied head; a lock, not a subject. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
/** Bug 0281's landed row for a RESERVED applied head; a lock, not a subject. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
/** `Result`'s own row at a lowered-schema-feeding position. */
const RESULT_SCHEMA = "theta/parse/result-in-schema-position";
/** The lexer's refusal of `1x`, the second §Non-goals control. */
const UNSUPPORTED = "theta/parse/unsupported-feature";

/** Which registry page holds a code's row — the load page for `theta/load/…`, else parse. */
function registryFor(code: string): { rows: RegistryRow[]; path: string } {
  return code.startsWith("theta/load/")
    ? { rows: LOAD_REGISTRY, path: LOAD_REGISTRY_PATH }
    : { rows: PARSE_REGISTRY, path: PARSE_REGISTRY_PATH };
}

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a row whose *Message* moved reds by naming the registry page rather than by a
 * bare `undefined` comparison downstream. No message prose is written out in
 * this file.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const { rows, path } = registryFor(code);
  const template = registryMessage(rows, code) as string | undefined;
  expect(template, `DIAG-4 anchor: ${path} must carry the Message row for ${code}`).toBeDefined();
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

/** The `params:` refusal, rendered for the field name `p` every fixture here declares. */
function paramsRefusalLine(): string {
  return line(PARAMS_NOT_EXPR, [["<param>", "p"]]);
}

/** Bug 0282's landed name refusal, rendered for the head `name`. */
function unresolvedLine(name: string): string {
  return line(UNRESOLVED, [["<name>", name]]);
}

// ===========================================================================
// The load harness.
// ===========================================================================

/** One parsed row: its codes, its rendered lines, its lowered `params:` and its captures. */
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
  const doc = parseDoc(source, "b0284.theta");
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
 * The `params:` carrier, in the exact shape bug 0284 §Reproduction spells it:
 * `---\ndescription: d\nmode: prompt\nparams:\n  p: '<type>'\n---\n\nlet z = 1\n"ok"\n`.
 * The type text sits on frontmatter line 5, column 6. The body carries a
 * binding rather than a bare string so the shared capture precondition has a
 * statement to read.
 */
function paramsTheta(label: string, typeText: string): LoadRow {
  return row(
    label,
    `---\ndescription: d\nmode: prompt\nparams:\n  p: '${typeText}'\n---\n\nlet z = 1\n"ok"\n`,
  );
}

/**
 * The lowered `params:` schema, as bug 0284 §Reproduction reads it
 * (`frontmatter.params.loweredSchema`), or `null` when the block did not lower.
 * The silent admission's own signature is a PRESENT lowered document whose `p`
 * is `{}` — a type that validates every value — so the subject cells assert
 * `null` here beside their codes rather than the codes alone.
 */
function lowered(r: LoadRow): unknown {
  return r.doc.frontmatter?.params?.loweredSchema ?? null;
}

/**
 * The composition root's registration gate, mirrored: `hasLoadParseError`
 * (`src/extension/production-composition.ts` line 3053, consulted at line
 * 1570) is `diagnostics.some(d => d.severity === "error" &&
 * (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")))`,
 * and a document carrying one is not registered. Every diagnostic below is a
 * `theta/load/…` or `theta/parse/…` code, so the code-prefix half of the real
 * predicate always holds here.
 */
function registered(r: LoadRow): boolean {
  return !r.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

/**
 * The 1-indexed `line:column` start of each diagnostic in a row. The captures
 * this bug spans emit at different coordinates — the `params:` field at its own
 * frontmatter line, the `let` / `fn` / `schema` sites at the declaration's
 * start, the query site at its expression's start — so the position is what
 * reads WHICH capture spoke.
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

/** Assert the registration outcome of every row, per the mirrored gate above. */
function expectRegistration(rows: readonly LoadRow[], expected: boolean): void {
  expect(
    rows.map((r) => [r.label, registered(r)]),
    "registration follows the diagnostic list: an error-severity load/parse refusal denies it",
  ).toEqual(rows.map((r) => [r.label, expected]));
}

// ===========================================================================
// (P) The `params:` right-hand side — the five subject spellings.
// ===========================================================================

/** The five heads bug 0284 §Reproduction measures at `params:`, applied at arity 1. */
const SUBJECT_PARAMS = [
  "a b<integer>",
  "Nope.Sub<integer>",
  "a-b<integer>",
  "f()<integer>",
  "1x<integer>",
] as const;

describe("b0284 (P) — a non-identifier applied head is refused at the `params:` right-hand side", () => {
  it("b0284-P: each of the five spellings draws the load refusal, lowers nothing and does not register", () => {
    // RED at HEAD: all five diagnostic lists are EMPTY, `lowered` is a present
    // object whose `p` is `{}`, and every document REGISTERS — the head passes
    // bug 0281's reserved gate (src/parser/params.ts line 795) and bug 0282's
    // closed-set gate (line 809, whose `IDENTIFIER.test(ctor)` conjunct fails
    // on every head here) and falls to the permissive catch-all (lines
    // 861–878), which pushes it onto no sink. The `params:` reader then filters
    // an empty list (line 263) and emits nothing (line 313).
    //
    // `1x<integer>` belongs to the subject HERE and not at the body captures:
    // the `params:` recovered text is the frontmatter scalar verbatim and
    // reaches no lexer, so the lexer refusal that owns it in a body (group (X))
    // does not intervene (§Non-goals, third bullet).
    const rows = SUBJECT_PARAMS.map((sp) => paramsTheta(`P — params: 'p: ${sp}'`, sp));
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [PARAMS_NOT_EXPR]),
      () => rows.map(() => [paramsRefusalLine()]),
    );
    expect(
      rows.map((r) => [r.label, lowered(r)]),
      "a refused `params:` block lowers to nothing; a present schema whose `p` is `{}` IS the silent admission",
    ).toEqual(rows.map((r) => [r.label, null]));
    expectRegistration(rows, false);
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the `params:` refusal speaks at the field's own frontmatter coordinate, where the bare-spelling control (group (C)) already speaks",
    ).toEqual(rows.map((r) => [r.label, ["5:6"]]));
  });
});

// ===========================================================================
// (S) The sub-choice discriminator — a brace-carrying argument list.
// ===========================================================================

describe("b0284 (S) — the head text, not the whole application, is what reaches the sink", () => {
  it("b0284-S: `p: 'a b<{x: integer}>'` refuses, because the head `a b` carries no brace", () => {
    // The one cell that separates bug 0284 §Fix's two adjudicable candidates,
    // and the adjudication on the record is candidate (i): push the HEAD text.
    //
    // WHY IT DISCRIMINATES. The shared decline
    // `isUnspellableTextRefusable` (src/parser/params.ts lines 1825–1826)
    // declines any fragment carrying a `{` or `}`. Under candidate (i) the sink
    // receives `a b` — brace-free by construction, since the head is the slice
    // BEFORE the first `<` (line 772) — so the decline never fires and the
    // field refuses. Under the rejected candidate (ii) the sink would receive
    // the whole application text `a b<{x: integer}>`, which the brace exemption
    // declines (§Reproduction's decline block measures
    // `isUnspellableTextRefusable("a b<{x: integer}>")` as `false`), and this
    // spelling would stay SILENT and register.
    //
    // The exemption itself is not narrowed by either candidate (§Non-goals,
    // fourth bullet): this cell asserts what TEXT the gate pushes, and it reds
    // both at HEAD (silence, no gate at all) and under candidate (ii).
    const r = paramsTheta("S — params: 'p: a b<{x: integer}>'", "a b<{x: integer}>");
    expectCaptured([r], []);
    expectRows([r], [[PARAMS_NOT_EXPR]], () => [[paramsRefusalLine()]]);
    expect(
      [[r.label, lowered(r)]],
      "the brace inside the ARGUMENT list must not buy the non-derivable HEAD an admission",
    ).toEqual([[r.label, null]]);
    expectRegistration([r], false);
  });
});

// ===========================================================================
// (N) Nesting — the three judged depths at `params:`.
// ===========================================================================

describe("b0284 (N) — a non-identifier applied head is refused at every judged depth", () => {
  it("b0284-N: the generic argument, the union arm and the inline-object field type all refuse", () => {
    // RED at HEAD in all three: §Reproduction measures `array<a b<integer>>`
    // lowering `p` to `{"type":"array","items":{}}`, `string | a b<integer>` to
    // `{"anyOf":[{"type":"string"},{}]}` and `{q: a b<integer>}` to a `$def`
    // whose `q` is `{}` — silent at each. These are the three depths
    // docs/spec_topics/frontmatter/frontmatter-fields-a.md line 58 names as
    // judged ("at the type's own top level, inside a union arm at any depth,
    // inside a `GenericType` argument, and inside an inline `ObjectType`'s
    // field type at any depth"), and the gate sits at the one RECURSIVE
    // lowering seam, so the interior head is judged exactly as a top-level one
    // is. A route that gated only the outermost application reds here.
    const rows = [
      paramsTheta("N1 — params: 'p: array<a b<integer>>'", "array<a b<integer>>"),
      paramsTheta("N2 — params: 'p: string | a b<integer>'", "string | a b<integer>"),
      paramsTheta("N3 — params: 'p: {q: a b<integer>}'", "{q: a b<integer>}"),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [PARAMS_NOT_EXPR]),
      () => rows.map(() => [paramsRefusalLine()]),
    );
    expect(
      rows.map((r) => [r.label, lowered(r)]),
      "no enclosing form — a legal generic, a union, an inline object — restores the interior head's admission",
    ).toEqual(rows.map((r) => [r.label, null]));
    expectRegistration(rows, false);
  });
});

// ===========================================================================
// (M) The manufactured shard — a sink-less recursion keeps HEAD's readings.
// ===========================================================================

describe("b0284 (M) — a head the argument split manufactured keeps the refusals the sink-less path draws", () => {
  it("b0284-M: an inline object cut in two by the angle-only split still resolves its nested names", () => {
    // GREEN at HEAD and after — a pin on what the new gate must NOT remove.
    //
    // `splitTopLevel(interior, ",")` (src/parser/params.ts, the generic-
    // application arm) tracks ANGLE depth only, so a comma inside an inline
    // object type cuts the argument in two and manufactures the shard
    // `{a: array<Ghost>`. That shard satisfies the same arm's positional
    // generic-application test and yields the head `{a: array`, which fails
    // `IDENTIFIER` — the exact shape the new gate fires on. Bug 0204's route
    // recurses such a segment through `withoutUnspellableSink`, so
    // `lowerCtx.unspellable` is ABSENT there and the not-expression push is a
    // no-op; a gate that returned anyway would skip the arm's argument walk
    // below it and lose the nested-name resolution that walk performs, leaving
    // these three spellings with NO refusal at all. Bug 0204's stated
    // under-refusal covers the not-expression sink alone; the `unresolved` sink
    // is one that path deliberately KEEPS.
    //
    // Each row is therefore pinned to its HEAD reading: `Ghost` is declared
    // nowhere, so the nested `array<Ghost>` / `q q<Ghost>` argument walk
    // resolves it to bug 0282's landed row, and `Result` at a schema-feeding
    // position adds its own row ahead of it. These cells red if the gate
    // returns while sink-less.
    const rows = [
      paramsTheta(
        "M1 — params: 'p: array<{a: array<Ghost>, b: x}>'",
        "array<{a: array<Ghost>, b: x}>",
      ),
      paramsTheta("M2 — params: 'p: array<{a: q q<Ghost>, b: x}>'", "array<{a: q q<Ghost>, b: x}>"),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [UNRESOLVED]),
      () => rows.map(() => [unresolvedLine("Ghost")]),
    );
    expect(
      rows.map((r) => [r.label, lowered(r)]),
      "a refused `params:` block lowers nothing",
    ).toEqual(rows.map((r) => [r.label, null]));
    expectRegistration(rows, false);
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the `params:` capture's own frontmatter coordinate, unmoved",
    ).toEqual(rows.map((r) => [r.label, ["5:6"]]));
  });

  it("b0284-M-result: the shard under `Result` keeps both rows it already draws", () => {
    // GREEN at HEAD and after. Same manufactured shard, under the closed set's
    // other head at a schema-feeding position: `Result` draws its own row and
    // the argument walk still reaches `Ghost`. Ordered whole-list equality pins
    // both members and their order, so a gate that returned sink-less would red
    // here by losing the second.
    const r = paramsTheta(
      "M3 — params: 'p: Result<{a: array<Ghost>, b: x}, string>'",
      "Result<{a: array<Ghost>, b: x}, string>",
    );
    expectCaptured([r], []);
    expectRows([r], [[RESULT_SCHEMA, UNRESOLVED]], () => [
      [line(RESULT_SCHEMA), unresolvedLine("Ghost")],
    ]);
    expect([[r.label, lowered(r)]], "a refused `params:` block lowers nothing").toEqual([
      [r.label, null],
    ]);
    expectRegistration([r], false);
  });
});

// ===========================================================================
// (B) The four body captures.
// ===========================================================================

/** One body capture: its fixture, the declarations it captures, its code and its range. */
interface BodyCapture {
  readonly id: string;
  readonly build: (spelling: string) => LoadRow;
  readonly decls: readonly string[];
  readonly code: string;
  readonly line: () => string;
  /**
   * The `line:column` this capture emits at — MEASURED over the same fixture
   * shape carrying the BARE spelling of the same head, which is what group (C)
   * asserts. The range is therefore fixed by the capture's existing sibling
   * emission (bug 0284 §Expected: "at that capture's existing range and under
   * that capture's existing row"), not chosen here.
   */
  readonly at: string;
}

const BODY_CAPTURES: readonly BodyCapture[] = [
  {
    id: "let-annot",
    build: (sp) => theta(`let-annot (${sp})`, `let x: ${sp} = 1\n"ok"`),
    decls: [],
    code: ANNOT_NOT_EXPR,
    line: () => line(ANNOT_NOT_EXPR, [["<name>", "x"]]),
    at: "6:1",
  },
  {
    id: "fn-param",
    build: (sp) => theta(`fn-param (${sp})`, `fn g(a: ${sp}) { return 1 }\n"ok"`),
    decls: [],
    code: ANNOT_NOT_EXPR,
    line: () => line(ANNOT_NOT_EXPR, [["<name>", "a"]]),
    at: "6:1",
  },
  {
    id: "fn-return",
    build: (sp) => theta(`fn-return (${sp})`, `fn g(): ${sp} { return 1 }\n"ok"`),
    decls: [],
    code: ANNOT_NOT_EXPR,
    line: () => line(ANNOT_NOT_EXPR, [["<name>", "g"]]),
    at: "6:1",
  },
  {
    id: "query-T",
    build: (sp) => theta(`query-T (${sp})`, `let q = @<${sp}>\`hi\`\n"ok"`),
    decls: [],
    code: QUERY_NOT_EXPR,
    line: () => line(QUERY_NOT_EXPR),
    at: "6:9",
  },
];

/** The three heads whose APPLIED spelling survives the body captures' own token join. */
const SUBJECT_BODY = ["Nope.Sub<integer>", "a-b<integer>", "f()<integer>"] as const;

/** Their bare spellings — the range-and-row oracle group (C) asserts unmoved. */
const BARE_BODY = ["Nope.Sub", "a-b", "f()"] as const;

describe("b0284 (B) — the four body captures refuse the applied head their bare spelling refuses", () => {
  it("b0284-B: `Nope.Sub<integer>`, `a-b<integer>` and `f()<integer>` refuse at let, fn-param, fn-return and `@<T>`", () => {
    // RED at HEAD: §Reproduction measures all twelve of these lists EMPTY.
    // `annotationSourceIsNotTypeExpression` (src/parser/type-layer-checks.ts
    // line 1266) reaches its verdict from the SAME sink the `params:` reader
    // does — `collectUnresolvedNamedTypes(text, NO_DECLARED_TYPE_NAMES,
    // undefined, unspellable)` then `unspellable.some(isUnspellableTextRefusable)`
    // (lines 1285–1286) — so the empty sink makes it answer `false` for exactly
    // the texts whose BARE spellings it refuses (group (C)).
    //
    // `a b<integer>` and `1x<integer>` are deliberately NOT in this group:
    // §Non-goals places both outside the body-capture subject, for reasons that
    // are not this seam's, and group (X) pins what they DO draw.
    const probes = BODY_CAPTURES.flatMap((capture) =>
      SUBJECT_BODY.map((spelling) => ({ capture, spelling, row: capture.build(spelling) })),
    );
    for (const capture of BODY_CAPTURES) {
      expectCaptured(
        probes.filter((p) => p.capture === capture).map((p) => p.row),
        capture.decls,
      );
    }
    expectRows(
      probes.map((p) => p.row),
      probes.map((p) => [p.capture.code]),
      () => probes.map((p) => [p.capture.line()]),
    );
    expectRegistration(
      probes.map((p) => p.row),
      false,
    );
    expect(
      probes.map((p) => [p.row.label, startPositions(p.row)]),
      "each refusal sits at the range that capture already uses for the bare spelling (group (C))",
    ).toEqual(probes.map((p) => [p.row.label, [p.capture.at]]));
  });

  it("b0284-B-schema: `schema S { a: f()<integer> }` refuses at the object-body field type", () => {
    // The fifth capture, and the fifth member of the not-expression family
    // (code-registry-parse.md line 106). RED at HEAD: measured EMPTY.
    //
    // `f()<integer>` is the spelling this capture is measured with, exactly as
    // §Reproduction measures it. The other two subject heads carry a `.` and a
    // `-`, which the schema-body field scanner splits on, so those fixtures
    // draw a THREE-diagnostic pileup (`schema-type-not-expression` plus a
    // stray-token `unsupported-feature` plus `malformed-schema-field`) whose
    // extra members belong to the field-list recovery rather than to this seam.
    // Asserting this capture on the head that leaves the field list intact
    // keeps the cell a witness of this bug and not of that recovery.
    const r = theta("B-schema — `schema S { a: f()<integer> }`", 'schema S { a: f()<integer> }\n"ok"');
    expectCaptured([r], ["S"]);
    expectRows([r], [[SCHEMA_NOT_EXPR]], () => [[line(SCHEMA_NOT_EXPR, [["<X>", "S"]])]]);
    expectRegistration([r], false);
    expect(
      [[r.label, startPositions(r)]],
      "the schema capture speaks at the declaration's own start, where its bare-spelling control (group (C)) speaks",
    ).toEqual([[r.label, ["6:1"]]]);
  });
});

// ===========================================================================
// (X) The two spellings §Non-goals removes from the body-capture subject.
// ===========================================================================

describe("b0284 (X) — at a BODY capture, `a b<integer>` and `1x<integer>` keep the readings they already draw", () => {
  it("b0284-X-join: `a b<integer>` token-joins to `ab<integer>` and draws bug 0282's landed refusal", () => {
    // GREEN at HEAD and after — an unchanged control, pinned exactly as bug
    // 0284 §Reproduction measures it. The body captures JOIN tokens, so the
    // text that reaches `lowerTypeExpr` is `ab<integer>`: an IDENTIFIER-shaped
    // head, which bug 0282's landed gate (src/parser/params.ts line 809)
    // already refuses onto `lowerCtx.unresolved`, rendering `unresolved named
    // type 'ab'`. This bug's gate must sit BESIDE that one and must not capture
    // this text — a route that dropped `IDENTIFIER.test(ctor)` from bug 0282's
    // gate instead of adding a second gate reds here (§Fix, "Ordering").
    const probes = BODY_CAPTURES.map((capture) => ({
      capture,
      row: capture.build("a b<integer>"),
    }));
    for (const p of probes) expectCaptured([p.row], p.capture.decls);
    expectRows(
      probes.map((p) => p.row),
      probes.map(() => [UNRESOLVED]),
      () => probes.map(() => [unresolvedLine("ab")]),
    );
    expectRegistration(
      probes.map((p) => p.row),
      false,
    );
    expect(
      probes.map((p) => [p.row.label, startPositions(p.row)]),
      "bug 0282's landed ranges at these captures, unmoved by a gate that runs beside its own",
    ).toEqual(probes.map((p) => [p.row.label, [p.capture.at]]));
  });

  it("b0284-X-lexer: `1x<integer>` is refused by the LEXER at every body capture, ALONGSIDE this bug's own refusal", () => {
    // CORRECTED CONTRACT, measured against the landed §Fix rather than assumed
    // ahead of it. `1x` is refused by the LEXER (`unsupported syntactic
    // feature: 1x`) at a coordinate INSIDE the annotation text — that much is
    // unchanged, and it is why this spelling stays outside §Non-goals' body-
    // capture SUBJECT set (group (B) does not name it). What the pre-fix
    // assumption got wrong is that this is the ONLY diagnostic: the capture's
    // OWN not-expression judgement runs over the raw annotation SOURCE TEXT
    // (`annotationSourceIsNotTypeExpression`, `collectUnresolvedNamedTypes` →
    // `lowerTypeSource` → `lowerTypeExpr`, independent of the real lexer's own
    // pass over the same statement) and this bug's new gate
    // (`src/parser/params.ts`, beside bug 0282's) now judges that text on its
    // OWN production-derivation reading, exactly as §Fix requires for every
    // head that is not identifier-shaped: `1x` is no `Ident`, so `1x<integer>`
    // derives from no `Type` alternative and this capture's not-expression row
    // fires — the same reading group (B) draws for `Nope.Sub<integer>`,
    // `a-b<integer>` and `f()<integer>`, and §Non-goals' own sentence never
    // promised this text a DIFFERENT reading, only that it is not the
    // MISSING-diagnostic subject this report is filed over. `let x: 1x = 1`
    // (the bare spelling, unapplied) already draws the SAME not-expression row
    // beside the lexer's — this fixture only adds the argument list, and an
    // argument list is not what buys a non-derivable head silence (the whole
    // report's premise). The capture's OWN guard
    // (`out.slice(annotationDiagStart).some(...)`, theta-document.ts) tests
    // only THIS capture's own type-grammar walk for a prior error, not the
    // lexer's separate pass, and bug 0279's coverer rule withholds a second
    // diagnostic only when the capture did NOT end at its own terminator
    // (`annotationAbsorbed`) — `1x<integer> = 1` parses past `1x` (the type-
    // grammar tokeniser accepts it as an ordinary atom) straight through to
    // `=`, so `annotationAbsorbed` is false and the capture holds text the
    // author spelled there, not absorbed debris: bug 0279's own rule is "no
    // coverer silences it". Two independent author mistakes — a malformed
    // token AND a head that derives from no `Type` production — draw two
    // independent diagnostics, exactly as the codebase already does for two
    // unrelated faults in one statement.
    //
    // The refusal's coordinate is the offending TOKEN's, which differs per
    // capture (the token sits at a different column of line 6 in each fixture),
    // so this cell asserts the code and rendered line and reads the column off
    // each row rather than pinning one shared value.
    const probes = BODY_CAPTURES.map((capture) => ({
      capture,
      row: capture.build("1x<integer>"),
    }));
    for (const p of probes) expectCaptured([p.row], p.capture.decls);
    expectRows(
      probes.map((p) => p.row),
      probes.map((p) => [p.capture.code, UNSUPPORTED]),
      () => probes.map((p) => [p.capture.line(), line(UNSUPPORTED, [["<construct>", "1x"]])]),
    );
    expectRegistration(
      probes.map((p) => p.row),
      false,
    );
  });
});

// ===========================================================================
// (C) The controls that must not move.
// ===========================================================================

describe("b0284 (C) — every control of §Reproduction is byte-unchanged", () => {
  it("b0284-C-bare-params: bare `a b` keeps the load refusal it already draws", () => {
    // GREEN at HEAD and after, and the asymmetry the fix removes: this is the
    // SAME text as group (P)'s first spelling with the argument list removed,
    // and it has always refused. A refusal for the bare spelling and silence
    // for the applied spelling of one non-derivable text is the whole report.
    const r = paramsTheta("C-bare — params: 'p: a b'", "a b");
    expectCaptured([r], []);
    expectRows([r], [[PARAMS_NOT_EXPR]], () => [[paramsRefusalLine()]]);
    expect([[r.label, lowered(r)]], "a refused `params:` block lowers nothing").toEqual([
      [r.label, null],
    ]);
    expectRegistration([r], false);
  });

  it("b0284-C-empty-head: `' <integer>'` keeps the row it already draws", () => {
    // GREEN at HEAD and after — the empty-head control §Fix names under "What
    // must not move". `s.indexOf("<")` is `0` here, so the `lt > 0` test at
    // src/parser/params.ts line 770 DECLINES the generic-application arm
    // entirely and the text reaches the ATOM catch-all, which does push it
    // (line 962). It must keep drawing exactly this row through that route,
    // never through the new gate.
    const r = paramsTheta("C-empty-head — params: 'p:  <integer>'", " <integer>");
    expectCaptured([r], []);
    expectRows([r], [[PARAMS_NOT_EXPR]], () => [[paramsRefusalLine()]]);
    expectRegistration([r], false);
  });

  it("b0284-C-0282: `Nope<integer>` keeps bug 0282's landed name refusal", () => {
    // GREEN at HEAD and after (§Non-goals, first bullet: bug 0282's
    // identifier-headed class is not reopened). The new gate sits AFTER bug
    // 0282's (src/parser/params.ts line 809); a gate ordered ahead of it, or
    // one keyed on the presence of an argument list, would capture this text
    // and change its code — and would render `unresolved named type` from the
    // wrong sink. Reds here if so.
    const r = paramsTheta("C-0282 — params: 'p: Nope<integer>'", "Nope<integer>");
    expectCaptured([r], []);
    expectRows([r], [[UNRESOLVED]], () => [[unresolvedLine("Nope")]]);
    expectRegistration([r], false);
  });

  it("b0284-C-0281: `Ok<integer>` keeps bug 0281's landed reserved refusal", () => {
    // GREEN at HEAD and after (§Non-goals, second bullet). Bug 0281's gate
    // stands at src/parser/params.ts line 795, ahead of both later gates; a new
    // gate written before it would capture this reserved head and change its
    // code.
    const r = paramsTheta("C-0281 — params: 'p: Ok<integer>'", "Ok<integer>");
    expectCaptured([r], []);
    expectRows([r], [[RESERVED]], () => [[line(RESERVED, [["<keyword>", "Ok"]])]]);
    expectRegistration([r], false);
  });

  it("b0284-C-closed-set: `array<integer>` stays clean and registering at `params:`", () => {
    // GREEN at HEAD and after — the anti-over-broadness lock. `array` is one of
    // the two heads the grammar parameterises (grammar.md lines 99–100, closed
    // at line 107) and the committed corpus spells it, so a gate keyed on
    // anything other than the head's shape-and-membership would refuse shipped
    // source and red here rather than in
    // tests/committed-fixture-parse-gate.test.ts.
    const r = paramsTheta("C-array — params: 'p: array<integer>'", "array<integer>");
    expectCaptured([r], []);
    expectRows([r], [[]], () => [[]]);
    expect(
      [[r.label, lowered(r)]],
      "the closed set's own head keeps lowering to its real schema, not to `{}`",
    ).toEqual([
      [
        r.label,
        {
          type: "object",
          properties: { p: { type: "array", items: { type: "integer" } } },
          required: ["p"],
          additionalProperties: false,
        },
      ],
    ]);
    expectRegistration([r], true);
  });

  it("b0284-C-result: `Result<string, integer>` is clean where it is legal, and keeps its own row where it is not", () => {
    // GREEN at HEAD and after, at BOTH positions, and the position choice is
    // deliberate. `Result<T, E>` HAS no lowered-schema form, so at `params:` —
    // a schema-FEEDING position — it draws `theta/parse/result-in-schema-position`
    // rather than loading clean (measured at this HEAD). The position where it
    // is legal, and where "clean" is the correct control reading, is the `fn`
    // RETURN TYPE, so the clean half is asserted there and the `params:` half is
    // asserted on the row it really draws. Both must be unmoved: `Result` is the
    // second of the grammar's two parameterised heads and §Fix names it under
    // "What must not move".
    const legal = theta(
      "C-result-legal — `fn g(): Result<string, integer> { return Ok(1) }`",
      "fn g(): Result<string, integer> { return Ok(1) }\n\"ok\"",
    );
    expectCaptured([legal], []);
    expectRows([legal], [[]], () => [[]]);
    expectRegistration([legal], true);

    const schemaFeeding = paramsTheta(
      "C-result-params — params: 'p: Result<string, integer>'",
      "Result<string, integer>",
    );
    expectCaptured([schemaFeeding], []);
    expectRows([schemaFeeding], [[RESULT_SCHEMA]], () => [[line(RESULT_SCHEMA)]]);
    expectRegistration([schemaFeeding], false);
  });

  it("b0284-C-bare-body: the bare spellings keep their captures' rows and ranges", () => {
    // GREEN at HEAD and after, and the RANGE ORACLE for group (B): these are
    // the "existing range"s §Expected names, measured here rather than chosen
    // there. `Nope.Sub`, `a-b` and `f()` already refuse at all four body
    // captures; group (B) asserts that their APPLIED spellings converge on
    // exactly these rows and these coordinates.
    const probes = BODY_CAPTURES.flatMap((capture) =>
      BARE_BODY.map((spelling) => ({ capture, row: capture.build(spelling) })),
    );
    for (const capture of BODY_CAPTURES) {
      expectCaptured(
        probes.filter((p) => p.capture === capture).map((p) => p.row),
        capture.decls,
      );
    }
    expectRows(
      probes.map((p) => p.row),
      probes.map((p) => [p.capture.code]),
      () => probes.map((p) => [p.capture.line()]),
    );
    expectRegistration(
      probes.map((p) => p.row),
      false,
    );
    expect(
      probes.map((p) => [p.row.label, startPositions(p.row)]),
      "the bare spellings' own ranges — the values group (B) asserts the applied spellings converge on",
    ).toEqual(probes.map((p) => [p.row.label, [p.capture.at]]));

    const schemaBare = theta("C-bare-schema — `schema S { a: f() }`", 'schema S { a: f() }\n"ok"');
    expectCaptured([schemaBare], ["S"]);
    expectRows([schemaBare], [[SCHEMA_NOT_EXPR]], () => [
      [line(SCHEMA_NOT_EXPR, [["<X>", "S"]])],
    ]);
    expectRegistration([schemaBare], false);
    expect(
      [[schemaBare.label, startPositions(schemaBare)]],
      "the schema capture's own range — the value group (B)'s schema cell converges on",
    ).toEqual([[schemaBare.label, ["6:1"]]]);
  });
});

// ===========================================================================
// (DIAG-2) The registry rows this file asserts against exist and are closed.
// ===========================================================================

describe("b0284 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0284-DIAG-2: all eight codes carry an E row of their own phase", () => {
    // DIAG-2: the registry is closed, so a code a test asserts must have a row
    // (`reconcileClosedSet`, tools/code-registry/index.js). This report's route
    // mints NOTHING and `tests/fixtures/h7a/permitted-codes.json` is
    // byte-unchanged: all four not-expression rows are pre-existing
    // (code-registry-load.md line 20; code-registry-parse.md lines 106, 107,
    // 108) and the fix BORROWS them, because the sink it pushes onto is that
    // family's own. What those four rows still owe is a same-commit DIAG-2
    // *Trigger* widening — none of them names the constructor-HEAD position —
    // and that widening belongs to the implementer of the fix, not to this
    // witness, which asserts codes by name and asserts no registry prose. This
    // cell fails loudly on the unmet precondition rather than letting `msg`
    // above substitute into an absent template.
    const asserted = [
      PARAMS_NOT_EXPR,
      ANNOT_NOT_EXPR,
      QUERY_NOT_EXPR,
      SCHEMA_NOT_EXPR,
      UNRESOLVED,
      RESERVED,
      RESULT_SCHEMA,
      UNSUPPORTED,
    ];
    const rows = asserted.map((code) => {
      const r = registryFor(code).rows.find((x) => x.code === code);
      return [code, r?.severity, r?.phase] as const;
    });
    expect(rows, "DIAG-2: each asserted code must carry a closed-set row").toEqual([
      [PARAMS_NOT_EXPR, "E", "load"],
      [ANNOT_NOT_EXPR, "E", "parse"],
      [QUERY_NOT_EXPR, "E", "parse"],
      [SCHEMA_NOT_EXPR, "E", "parse"],
      [UNRESOLVED, "E", "parse"],
      [RESERVED, "E", "parse"],
      [RESULT_SCHEMA, "E", "parse"],
      [UNSUPPORTED, "E", "parse"],
    ]);
    expect(
      msg(PARAMS_NOT_EXPR, [["<param>", "p"]]),
      "the `params:` refusal's rendered Message must name the field it refuses",
    ).toContain("'p'");
  });
});
