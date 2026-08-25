import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0277 — an UNAPPLIED generic-constructor head (`Result`, `array`) or a
// `Result` value constructor (`Ok`, `Err`) written in a type position is
// admitted at five of the nine type-reference captures and lowers to the empty
// type there, while the same four spellings are refused at the other four
// (docs/bugs/0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md).
//
// THE SEAM, AS FIXED (bug 0277 §Fix route (a), landed). `lowerTypeExpr`'s atom
// arm (`RESERVED_KEYWORDS.has(s)`, `src/parser/params.ts`) is reached only
// after the generic-application arm has declined the text, so an APPLIED head
// never arrives there and an unapplied one always does. The atom arm
// classifies the spelling as a reserved keyword read where an `Ident` is read
// — the branch stands immediately ahead of the `NamedType ::= Ident`
// resolution (`IDENTIFIER.test(s)`, same file) — publishes it through the
// optional `reservedKeywords` out-parameter and lowers the position to the
// empty type. Nine captures consume that out-parameter, and all nine now
// render every entry directly: the `schema X = …` alias/union right-hand side,
// the `schema` body field type, the `@<T>` query annotation's RESPONSE part
// and its `E` argument, the `let` annotation, the `fn` parameter type, the
// `fn` return type and the `invoke<Type>` ascription
// (`src/parser/theta-document.ts`), and the `params:` right-hand side, which
// builds its own diagnostic (`src/parser/params.ts` lines 240–248). At HEAD,
// before this fix, the five newly-wired sites (the `let` annotation, the `fn`
// parameter type, the `fn` return type, the `invoke<Type>` ascription and the
// `E` argument) rendered through `admittedReservedKeywords`, whose
// `WITHHELD_TYPE_HEAD_KEYWORDS` set held exactly these four spellings and
// dropped them — both since removed (§1 below).
//
// THE SETTLED TARGET BEHAVIOUR THIS FILE ENCODES (§Expected behaviour and §Fix
// ROUTE (a), the settled route, §1: `admittedReservedKeywords` and
// `WITHHELD_TYPE_HEAD_KEYWORDS` deleted — house rules bar the dead identity
// wrapper a keep-and-neutralise route would otherwise leave behind). Each of
// the five filtered captures renders its sink directly, exactly as the four
// unfiltered ones already do. An unapplied `Result` / `array` / `Ok` / `Err` then draws
// `theta/parse/reserved-keyword-as-identifier` at ALL NINE captures, at each
// site's existing sibling range, and the document does not register. No code is
// minted and no *Message* byte moves — the row's *Trigger* enumerates no
// position, and its neighbour row states the same reading directly ("A
// reserved-keyword spelling read where a `NamedType` is read is
// `theta/parse/reserved-keyword-as-identifier`'s to report at every position
// alike", docs/spec_topics/diagnostics/code-registry-parse.md line 112). The
// ground is the grammar: `Type` has six alternatives
// (docs/spec_topics/grammar.md lines 90–95), `GenericType`'s two spell their
// own `"<" … ">"` (lines 99–100), and docs/spec_topics/lexical.md line 20 makes
// each constructor keyword reachable only "as a **parameterised** type". An
// error-severity `theta/parse/*` diagnostic denies registration — the GOV-15
// loads-cleanly reading
// (docs/spec_topics/governance/source-language-stability.md line 9).
//
// WHAT IS RED HERE AND WHY. Groups (U), (I) and (N-red) assert one refusal
// where the parser at HEAD produces an EMPTY diagnostic list, so each red reads
// "expected [theta/parse/reserved-keyword-as-identifier], received []". Every
// other group is measured at HEAD, green there, and must stay green: group (A)
// the applied heads at the five filtered captures, group (W) the four
// unfiltered captures, group (N-green) the legal nesting, and group (K) the
// applied value-constructor spelling.
//
// THE INERT-ANNOTATION HALF, group (I). Because the unapplied head lowers to
// the empty type, the annotation constrains nothing: `let a: Result = "s"` and
// `fn f(): Result { 3 }` load at HEAD where `let a: integer = "s"` draws
// `theta/parse/let-rhs-type-mismatch`. Route (a) refuses the document, so the
// refusal is the whole verdict and the position's own mismatch row never runs
// — the lowering itself is unchanged, which is why each of these rows is
// asserted as ONE line and not two.
//
// BOUNDS THIS FILE ALSO LOCKS, EACH FROM §Non-goals:
//
//   The APPLIED heads stay admitted, group (A). `Result<integer, string>` and
//   `array<integer>` are legal and the committed corpus spells both
//   (docs/examples/personas.thetalib line 7, docs/examples/summarise-doc.theta
//   line 10). They never reach the atom arm at all, which is why they are
//   silent at the four captures that filter nothing — so a route that refused
//   them would be refusing shipped source, and this group is that tripwire.
//
//   The four unfiltered captures do not move, group (W). They already report
//   this class; the fix adds emitters and moves no existing one. The `Ok` /
//   `Err` `schema` alias rows are the alias parser reading the spelling as a
//   declaration head before the type side runs, so they carry
//   `theta/parse/empty-schema-body` instead, and the three lowered-schema
//   positions answer an applied `Result` with
//   `theta/parse/result-in-schema-position` — an unrelated row that
//   §Non-goals leave alone. Both are measured and pinned as they stand.
//
//   The never-legal keyword class is settled elsewhere. `match` and `return`
//   already refuse at all nine captures
//   (tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts);
//   no fixture here writes one, because the four spellings in the withheld set
//   are the whole subject.
//
//   An applied head of the WRONG arity is a separate row's subject and is
//   already refused at these captures, so no fixture here writes one.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (tests/helpers/e2e-s1.ts — the shipped whole-file entry point wrapped in
// inert deps, no behaviour stubbed). An integration tier would add a round trip
// to a value already fixed at the parse boundary and observe nothing sharper; a
// live tier cannot see a parse-time diagnostic LIST at all, only the
// registration outcome it implies, which the standalone live cell
// tests/live/b0277live-unapplied-generic-head-registration.test.ts covers.
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
// diagnostic nor one at the wrong position can hide.

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

/** The row an unapplied head must draw at all nine captures. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
/** The check group (I) shows an unapplied `let` annotation currently disables. */
const LET_MISMATCH = "theta/parse/let-rhs-type-mismatch";
/** What the `Ok` / `Err` `schema` alias rows draw instead, at the alias head. */
const EMPTY_SCHEMA = "theta/parse/empty-schema-body";
/** The applied `Result`'s own row at the three lowered-schema positions. */
const RESULT_SCHEMA = "theta/parse/result-in-schema-position";

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
  const doc = parseDoc(source, "b0277.theta");
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
 * given type — the ninth capture, which builds its diagnostic itself rather
 * than through the shared builder. The type text sits on frontmatter line 5.
 * The body carries a binding rather than a bare string so the shared capture
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
 * The 1-indexed `line:column` start of each diagnostic in a row. The captures
 * this bug separates emit at different columns of one source line — the `let`,
 * `fn` parameter and `fn` return sites at the statement's own start, the
 * `invoke<Type>` and query sites at their expression's start — so the column is
 * what reads WHICH capture spoke.
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
// The probed captures.
// ===========================================================================

/** One probed capture: its fixture and its emission range, parameterised by the head text. */
interface Capture {
  readonly id: string;
  readonly build: (head: string) => LoadRow;
  /**
   * The `line:column` the capture emits at, measured at HEAD over the same
   * fixture shape at an ADMITTED reserved spelling — the spellings the withheld
   * set does not hold back already draw this row at these captures, so the
   * range each site passes is observable today and is not chosen here.
   */
  readonly at: string;
}

/** The five captures that render their sink through the withhold. */
const FILTERED: readonly Capture[] = [
  {
    id: "U1 — `@<T>` query capture, `E` argument",
    build: (h) => theta(`U1 (${h})`, `let r = @<Result<integer, ${h}>>\`q\`\n"ok"`),
    at: "6:9",
  },
  {
    id: "U2 — `fn` return type",
    build: (h) => theta(`U2 (${h})`, `fn step(): ${h} { Ok(1) }\n"ok"`),
    at: "6:1",
  },
  {
    id: "U3 — `fn` parameter type",
    build: (h) => theta(`U3 (${h})`, `fn step(p: ${h}): integer { 1 }\n"ok"`),
    at: "6:1",
  },
  {
    id: "U4 — `let` annotation",
    build: (h) => theta(`U4 (${h})`, `let a: ${h} = Ok(1)\n"ok"`),
    at: "6:1",
  },
  {
    id: "U5 — `invoke<Type>` ascription",
    build: (h) => theta(`U5 (${h})`, `let r = invoke<${h}>("./x.theta", "hi")\n"ok"`),
    at: "6:9",
  },
];

/**
 * The four spellings the withheld set holds. Two are generic-constructor heads
 * the grammar admits only WITH an argument list; two are `Result`'s own value
 * constructors, which no `Type` production spells at all.
 */
const HEADS = ["Result", "array", "Ok", "Err"] as const;

/** Every (capture, head) pair, in table order. */
function cells(captures: readonly Capture[]): { row: LoadRow; head: string; at: string }[] {
  return captures.flatMap((c) => HEADS.map((head) => ({ row: c.build(head), head, at: c.at })));
}

// ===========================================================================
// (U) The twenty filtered cells — an unapplied head is refused at all five.
// ===========================================================================

describe("b0277 (U) — an unapplied constructor head at the five filtered captures is refused", () => {
  it("b0277-U: each of the five captures draws exactly one keyword refusal at each of the four heads", () => {
    // The heart of the report, and the largest red group: at HEAD all twenty
    // diagnostic lists are EMPTY, because `admittedReservedKeywords` drops
    // exactly these four spellings before the sink is rendered. The head text
    // travels in the *Message*, so no cell can satisfy another's assertion.
    const probes = cells(FILTERED);
    expectCaptured(
      probes.map((c) => c.row),
      [],
    );
    expectRows(
      probes.map((c) => c.row),
      probes.map(() => [RESERVED]),
      () => probes.map((c) => [reservedLine(c.head)]),
    );
  });

  it("b0277-U-position: each refusal sits at the range that capture already uses for an admitted spelling", () => {
    // The range is fixed by measurement, not chosen: the twenty admitted
    // reserved spellings already draw this row at these captures, at the
    // statement's own start for the `let` and the two `fn` sites and at the
    // expression's start for the `invoke<Type>` and query sites. This cell reds
    // on a route that emitted the right code from the wrong capture, which the
    // columns separate on one source line.
    const probes = cells(FILTERED);
    expect(
      probes.map((c) => [c.row.label, startPositions(c.row)]),
      "an unapplied head refuses at the same range its capture already uses for an admitted spelling",
    ).toEqual(probes.map((c) => [c.row.label, [c.at]]));
  });

  it("b0277-U-registration: the refusal is error-severity and denies registration at all twenty", () => {
    // At HEAD every one of these twenty documents registers — the reason a
    // theta whose annotation derives from no `Type` production runs with that
    // annotation discarded. Under the settled route none does.
    const probes = cells(FILTERED);
    expectCaptured(
      probes.map((c) => c.row),
      [],
    );
    expect(
      probes.map((c) => [c.row.label, c.row.doc.diagnostics.map((d: Diagnostic) => d.severity)]),
      `${RESERVED} is an E row, so its emission must be error-severity at every capture`,
    ).toEqual(probes.map((c) => [c.row.label, ["error"]]));
    expect(
      probes.map((c) => [c.row.label, registered(c.row)]),
      "a refused document is not registered",
    ).toEqual(probes.map((c) => [c.row.label, false]));
  });
});

// ===========================================================================
// (I) The inert-annotation half — the annotation the author wrote is kept.
// ===========================================================================

describe("b0277 (I) — an annotation spelled as an unapplied head no longer loads", () => {
  it("b0277-I: the seven inert annotations draw the keyword refusal and do not register", () => {
    // RED at HEAD, where each of these seven loads with an EMPTY list: the
    // unapplied head lowers to the empty type, so the position's own check runs
    // against a type that admits everything and `let a: Result = "s"` is
    // accepted where the annotated control below is not. Each row is asserted
    // as ONE line: route (a) refuses the document at the head itself, and the
    // lowering is untouched, so no second value-side line joins the refusal.
    const rows = [
      theta("I1 — `let a: Result = 3`", 'let a: Result = 3\n"ok"'),
      theta("I2 — `let a: Result = \"s\"`", 'let a: Result = "s"\n"ok"'),
      theta("I3 — `let a: array = 3`", 'let a: array = 3\n"ok"'),
      theta("I4 — `let a: Ok = 3`", 'let a: Ok = 3\n"ok"'),
      theta("I5 — `let a: Err = 3`", 'let a: Err = 3\n"ok"'),
      theta("I6 — `fn f(): Result { 3 }`", 'fn f(): Result { 3 }\n"ok"'),
      theta("I7 — `fn f(): array { 3 }`", 'fn f(): array { 3 }\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => [RESERVED]),
      () => [
        [reservedLine("Result")],
        [reservedLine("Result")],
        [reservedLine("array")],
        [reservedLine("Ok")],
        [reservedLine("Err")],
        [reservedLine("Result")],
        [reservedLine("array")],
      ],
    );
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the `let` and `fn` return captures speak at their statement's own start",
    ).toEqual(rows.map((r) => [r.label, ["6:1"]]));
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "none of the seven registers once its annotation is refused",
    ).toEqual(rows.map((r) => [r.label, false]));
  });

  it("b0277-I-control: an annotation the grammar derives keeps driving its own check", () => {
    // GREEN at HEAD and the contrast that makes group (I) legible: the same
    // `let` capture, annotated with a `PrimitiveType`, reports the initialiser
    // mismatch the unapplied heads above silently suppress. This row's code is
    // a `type`-phase row and must not move under a change to the keyword class.
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
// (A) The APPLIED heads at the five filtered captures — nothing moves.
// ===========================================================================

describe("b0277 (A) — an applied constructor head stays legal and silent at all five captures", () => {
  it("b0277-A: `Result<integer, string>` and `array<integer>` keep empty lists and keep registering", () => {
    // GREEN at HEAD and the anti-over-broad lock of the whole report. An
    // applied head is consumed structurally by the generic-application arm and
    // never reaches the atom arm the withheld set guards, which is why it is
    // silent even at the captures that filter nothing (group (W)). Both
    // spellings are shipped source — docs/examples/personas.thetalib line 7 and
    // docs/examples/summarise-doc.theta line 10 — so a route that read the
    // withhold as a statement about the SPELLING rather than about the
    // zero-argument form reds here rather than in the committed-fixture gate.
    const applied = ["Result<integer, string>", "array<integer>"];
    const rows = FILTERED.flatMap((c) =>
      applied.map((h) => {
        const r = c.build(h);
        return { ...r, label: `A — ${c.id} (${h})` };
      }),
    );
    expectCaptured(rows, []);
    expectRows(
      rows,
      rows.map(() => []),
      () => rows.map(() => []),
    );
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "every applied head keeps registering at every filtered capture",
    ).toEqual(rows.map((r) => [r.label, true]));
  });
});

// ===========================================================================
// (W) The four unfiltered captures — measured at HEAD, byte-unchanged.
// ===========================================================================

describe("b0277 (W) — the four captures that already refuse are unmoved", () => {
  it("b0277-W-heads: each unfiltered capture keeps its measured disposition at all four heads", () => {
    // GREEN at HEAD. These four render every sink entry today, which is what
    // makes the split filtered-versus-unfiltered rather than one anomalous
    // capture: the fix adds emitters and moves no existing one. Two cells are
    // not the keyword row and are pinned as measured rather than assumed — the
    // `schema` alias reads `Ok` / `Err` as a declaration head before its type
    // side runs, so those two rows draw the empty-body refusal at the alias
    // instead.
    const queryHead = HEADS.map((h) => theta(`W-query (${h})`, `let r = @<${h}>\`q\`\n"ok"`));
    expectCaptured(queryHead, []);
    expectRows(
      queryHead,
      queryHead.map(() => [RESERVED]),
      () => HEADS.map((h) => [reservedLine(h)]),
    );
    expect(
      queryHead.map((r) => [r.label, startPositions(r)]),
      "the query annotation's response part speaks at the query expression",
    ).toEqual(queryHead.map((r) => [r.label, ["6:9"]]));

    const schemaField = HEADS.map((h) => theta(`W-schema-field (${h})`, `schema S { f: ${h} }\n"ok"`));
    expectCaptured(schemaField, ["S"]);
    expectRows(
      schemaField,
      schemaField.map(() => [RESERVED]),
      () => HEADS.map((h) => [reservedLine(h)]),
    );

    const schemaAlias = HEADS.map((h) => theta(`W-schema-alias (${h})`, `schema S = ${h}\n"ok"`));
    expectCaptured(schemaAlias, ["S"]);
    expectRows(
      schemaAlias,
      [[RESERVED], [RESERVED], [EMPTY_SCHEMA], [EMPTY_SCHEMA]],
      () => [
        [reservedLine("Result")],
        [reservedLine("array")],
        [line(EMPTY_SCHEMA, [["<X>", "S"]])],
        [line(EMPTY_SCHEMA, [["<X>", "S"]])],
      ],
    );

    const params = HEADS.map((h) => paramsTheta(`W-params (${h})`, h));
    expectCaptured(params, []);
    expectRows(
      params,
      params.map(() => [RESERVED]),
      () => HEADS.map((h) => [reservedLine(h)]),
    );

    const all = [...queryHead, ...schemaField, ...schemaAlias, ...params];
    expect(
      all.map((r) => [r.label, registered(r)]),
      "every unfiltered capture already refuses these heads, so none of the sixteen registers",
    ).toEqual(all.map((r) => [r.label, false]));
  });

  it("b0277-W-applied: the applied heads keep their measured dispositions at the unfiltered captures", () => {
    // GREEN at HEAD, and the direct evidence that the withheld set protects no
    // applied head: at the three captures that filter NOTHING, an applied
    // `Result` draws the lowered-schema row and never the keyword row, and an
    // applied `array` draws nothing at all. What the set withholds is therefore
    // only the zero-argument spellings group (U) covers.
    const result = [
      theta("W-applied-query — `@<Result<integer, string>>`", 'let r = @<Result<integer, string>>`q`\n"ok"'),
      theta("W-applied-schema-field — `schema S { f: Result<integer, string> }`", 'schema S { f: Result<integer, string> }\n"ok"'),
      theta("W-applied-schema-alias — `schema S = Result<integer, string>`", 'schema S = Result<integer, string>\n"ok"'),
      paramsTheta("W-applied-params — `Result<integer, string>`", "Result<integer, string>"),
    ];
    expectCaptured([result[0] as LoadRow, result[3] as LoadRow], []);
    expectCaptured([result[1] as LoadRow], ["S"]);
    expectCaptured([result[2] as LoadRow], ["S"]);
    expectRows(
      result,
      [[], [RESULT_SCHEMA], [RESULT_SCHEMA], [RESULT_SCHEMA]],
      () => [[], [line(RESULT_SCHEMA)], [line(RESULT_SCHEMA)], [line(RESULT_SCHEMA)]],
    );

    const array = [
      theta("W-applied-array-query — `@<array<integer>>`", 'let r = @<array<integer>>`q`\n"ok"'),
      theta("W-applied-array-schema-field — `schema S { f: array<integer> }`", 'schema S { f: array<integer> }\n"ok"'),
      theta("W-applied-array-schema-alias — `schema S = array<integer>`", 'schema S = array<integer>\n"ok"'),
      paramsTheta("W-applied-array-params — `array<integer>`", "array<integer>"),
    ];
    expectRows(
      array,
      array.map(() => []),
      () => array.map(() => []),
    );
    expect(
      array.map((r) => [r.label, registered(r)]),
      "the applied `array` head registers at every unfiltered capture",
    ).toEqual(array.map((r) => [r.label, true]));
  });
});

// ===========================================================================
// (N) Nesting — the head one level down reads the same as at the top level.
// ===========================================================================

describe("b0277 (N) — an unapplied head nested inside a legal application reads alike", () => {
  it("b0277-N-red: `array<Result>` at a filtered capture draws the refusal it already draws at an unfiltered one", () => {
    // RED at HEAD, where both lists are EMPTY. The identical text inside a
    // `schema` field is refused today (the control below), and §Expected
    // behaviour is that the reading does not depend on which capture holds the
    // spelling: the atom arm classifies the nested head exactly as it
    // classifies a top-level one, and only the render policy differed.
    const rows = [
      theta("N1 — `fn step(): array<Result> { Ok(1) }`", 'fn step(): array<Result> { Ok(1) }\n"ok"'),
      theta("N2 — `let a: array<Ok> = [1]`", 'let a: array<Ok> = [1]\n"ok"'),
    ];
    expectCaptured(rows, []);
    expectRows(rows, rows.map(() => [RESERVED]), () => [
      [reservedLine("Result")],
      [reservedLine("Ok")],
    ]);
    expect(
      rows.map((r) => [r.label, startPositions(r)]),
      "the nested head is reported by its enclosing capture, at that capture's own range",
    ).toEqual(rows.map((r) => [r.label, ["6:1"]]));
    expect(
      rows.map((r) => [r.label, registered(r)]),
      "neither nesting registers once its head is refused",
    ).toEqual(rows.map((r) => [r.label, false]));
  });

  it("b0277-N-control: the same nesting at an unfiltered capture already refuses, and a fully applied nesting stays legal", () => {
    // GREEN at HEAD in both directions. The `schema` field row is the measured
    // evidence the nested head reaches the sink at all; the fully applied
    // nestings are the tripwire against a route that read "nested" rather than
    // "unapplied" as the condition — those spell every argument list the
    // grammar requires and must keep loading.
    const unfiltered = theta(
      "N-control-1 — `schema S { f: array<Result> }`",
      'schema S { f: array<Result> }\n"ok"',
    );
    expectCaptured([unfiltered], ["S"]);
    expectRows([unfiltered], [[RESERVED]], () => [[reservedLine("Result")]]);

    const legal = [
      theta(
        "N-control-2 — `let a: array<Result<integer, string>> = []`",
        'let a: array<Result<integer, string>> = []\n"ok"',
      ),
      theta(
        "N-control-3 — `fn f(): array<Result<integer, string>> { [] }`",
        'fn f(): array<Result<integer, string>> { [] }\n"ok"',
      ),
      theta(
        "N-control-4 — `@<Result<integer, array<integer>>>`",
        'let r = @<Result<integer, array<integer>>>`q`\n"ok"',
      ),
    ];
    expectCaptured(legal, []);
    expectRows(
      legal,
      legal.map(() => []),
      () => legal.map(() => []),
    );
    expect(
      legal.map((r) => [r.label, registered(r)]),
      "a nesting whose every head carries its argument list keeps registering",
    ).toEqual(legal.map((r) => [r.label, true]));
  });
});

// ===========================================================================
// (K) The APPLIED value-constructor spelling — re-founded under bug 0281.
// ===========================================================================

describe("b0277 (K) — an applied `Ok<…>` / `Err<…>` spelling refuses, at a filtered and an unfiltered capture alike", () => {
  // These five cells (K1–K5) are bug 0281's, by that report's own "Flip
  // authority" clause naming them by file and range (0.277.0,
  // docs/bugs/0281-applied-ok-err-generic-application-silent-at-every-capture.md
  // §Fix route (a), NARROW variant). The route gates the seam an applied
  // spelling reaches — `lowerTypeExpr`'s generic-application arm,
  // `src/parser/params.ts` — on "a reserved spelling that is not a
  // constructor keyword", so `Ok` and `Err` written with an argument list
  // converge on the same `theta/parse/reserved-keyword-as-identifier` refusal
  // their bare spelling already draws at these five captures: one reading for
  // one spelling, which is what the group asserts. A head that is no reserved
  // spelling is untouched by that gate and stays outside this group.
  it("b0277-K: the applied value-constructor spellings draw the keyword refusal", () => {
    const rows = [
      theta("K1 — `let a: Ok<integer> = 3`", 'let a: Ok<integer> = 3\n"ok"'),
      theta("K2 — `let a: Err<integer> = 3`", 'let a: Err<integer> = 3\n"ok"'),
      theta("K3 — `fn f(): Ok<integer> { 3 }`", 'fn f(): Ok<integer> { 3 }\n"ok"'),
      theta("K4 — `let a: Ok<integer, string> = 3`", 'let a: Ok<integer, string> = 3\n"ok"'),
    ];
    expectCaptured(rows, []);
    const unfiltered = theta("K5 — `schema S { f: Ok<integer> }`", 'schema S { f: Ok<integer> }\n"ok"');
    expectCaptured([unfiltered], ["S"]);
    const heads = ["Ok", "Err", "Ok", "Ok", "Ok"];
    expectRows(
      [...rows, unfiltered],
      heads.map(() => [RESERVED]),
      () => heads.map((head) => [reservedLine(head)]),
    );
    expect(
      [...rows, unfiltered].map((r) => [r.label, startPositions(r)]),
      "each refusal sits at its capture's own declaration start, the range the bare spelling already uses",
    ).toEqual([...rows, unfiltered].map((r) => [r.label, ["6:1"]]));
    expect(
      [...rows, unfiltered].map((r) => [r.label, registered(r)]),
      "the applied value-constructor spelling no longer registers, at a filtered or an unfiltered capture alike",
    ).toEqual([...rows, unfiltered].map((r) => [r.label, false]));
  });
});

// ===========================================================================
// (DIAG-2) The registry rows this file asserts against exist and are closed.
// ===========================================================================

describe("b0277 (DIAG-2) — every asserted code has a registry row", () => {
  it("b0277-DIAG-2: all four codes carry an E row of their own phase and a placeholder-bearing Message", () => {
    // DIAG-2: the registry is closed, so a code a test asserts must have a row
    // (`reconcileClosedSet`, tools/code-registry/index.js). No code is minted
    // here. The `theta/parse/reserved-keyword-as-identifier` row's *Trigger*
    // enumerates no position — "Reserved keyword used in an identifier
    // position." (code-registry-parse.md line 21) — so five further identifier
    // positions entering its emission set makes the behaviour match the row as
    // registered, and no *Message* byte and no row moves under version 0.275.0.
    // This cell fails loudly on the unmet precondition rather than letting
    // `msg` above substitute into an absent template.
    const rows = [RESERVED, LET_MISMATCH, EMPTY_SCHEMA, RESULT_SCHEMA].map((code) => {
      const r = REGISTRY.find((x) => x.code === code);
      return [code, r?.severity, r?.phase] as const;
    });
    expect(
      rows,
      `DIAG-2: ${REGISTRY_PATH} must carry a closed-set row for each asserted code`,
    ).toEqual([
      [RESERVED, "E", "parse"],
      [LET_MISMATCH, "E", "type"],
      [EMPTY_SCHEMA, "E", "parse"],
      [RESULT_SCHEMA, "E", "parse"],
    ]);
    expect(
      msg(RESERVED, [["<keyword>", "Result"]]),
      "the keyword refusal's rendered Message must carry the spelling it names",
    ).toContain("Result");
  });
});
