import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0285 — a `schema` object-body field type whose written text carries a `.`
// or a `-` (`Nope.Sub`, `a-b`, `string.b`) is cut into a type shard plus a
// phantom next field, and the phantom draws
// `theta/parse/unsupported-feature` rendering `schema fields must be
// comma-separated` over a body that spells ONE field and therefore no separator
// position
// (docs/bugs/0285-schema-field-boundary-manufactures-phantom-comma-diagnostic.md).
//
// THE SEAM, two sites in one file. `parseType`'s `stopAtFieldBoundary` arm
// (src/parser/theta-document.ts line 3967) ends the capture in front of any
// ident/keyword/string/number token once `parts.length > 0`, gated on one thing
// only — `prevText !== "|"`. It never asks whether the PRECEDING part can END a
// `Type` atom, and a `.` or `-` is in none of the depth-0 stop set at lines
// 3943–3951 (`,` `)` `{` `}` `=`), so such punctuation JOINS the capture and
// then satisfies the gate exactly as a completed `Ident` does. The sole caller
// passing that flag is `parseSchemaObjectBody`'s `const typeSource =
// this.parseType(true)` (line 3279), which is why the pileup is confined to a
// schema object-body field type at depth 0. The separator arm below it (line
// 3305, `startsNextField`) then sees an ident at the cursor with no `,` behind
// it and pushes the comma-separation line at that token's range; the loop's
// next iteration reads the same token as a field name, finds no `:`, and
// reaches `recoverMalformedSchemaField` (line 3222).
//
// THE SANCTIONED / PHANTOM SPLIT this file encodes. Two of the three lines are
// correct and must survive byte-identical. `theta/parse/schema-type-not-expression`
// (docs/spec_topics/diagnostics/code-registry-parse.md line 106) judges the
// retained field's junk type at the declaration's own range, and body-level
// `theta/parse/malformed-schema-field` (line 99) names the token from which no
// further `Field` derives; line 106 pins that PAIR verbatim as the reading of
// `schema S { a: -1 }`. The phantom is the third line: its registered input
// class is fixed to "a schema object body whose fields are not comma-separated"
// (docs/spec_topics/diagnostics/placeholder-rendering-a.md line 93), and
// `SchemaShape ::= "{" Field ("," Field)* ","? "}"`
// (docs/spec_topics/grammar.md line 172) makes the comma a separator BETWEEN
// fields — a one-field body has no separator position for it to report on.
//
// THE ROUTE THIS FILE ENCODES — bug 0285 §Fix, sub-choice (1)(a) and
// sub-choice (2) adjudicated NO. At the separator arm (line 3305) the
// comma-separation line is WITHHELD when the field's captured `typeSource` does
// not END a `Type` atom: its last character is none of `[A-Za-z0-9_]`, `>`,
// `)`, `]`, `}`, `"`, `'`, or the capture is empty. `malformed-schema-field`
// does NOT withhold — its *Trigger* (line 99) is literally satisfied and the
// resulting pair is the one line 106 pins. The splitter is NOT touched: a route
// that made the capture stop later would change `schema S { a: -1 }`'s
// `typeSource` from `-` to `-1` and delete that body's
// `malformed-schema-field` line, moving a pinned reading (§Fix, final
// paragraph). No code is minted and no `Message` moves.
//
// WHAT IS RED AND WHAT IS A LOCK. Group (A) and group (F) are RED at HEAD: each
// of those bodies draws the comma-separation line as a third (group (A)) or
// second (group (F)) diagnostic, and each cell here asserts the list WITHOUT
// it. Groups (B), (C), (D) are measured GREEN at HEAD and must stay green —
// the registry's pinned sanctioned pair, the genuine missing-comma true
// positives (whose boundary predecessors `string`, `>` and `"` all END a `Type`
// atom, which is what pins the predicate's admitted characters), the clean
// comma-separated body, and the depth / capture bounds outside the subject.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (tests/helpers/e2e-s1.ts — the shipped whole-file entry point wrapped in
// inert deps, no behaviour stubbed). The subject IS a diagnostic list at a
// parse boundary; an integration tier would round-trip a value already fixed
// there and observe nothing sharper, and a live tier cannot see a diagnostic
// list at all, only the registration outcome it implies — which is identical
// before and after the fix (§Non-goals: the refusal itself is not at issue).
//
// NO SILENT SKIPPING. Nothing here early-returns, branches on the environment
// or skips. `msg` asserts its registry row is present and carries each
// placeholder it fills before substituting, and every schema cell asserts its
// fixture captured the declaration it names BEFORE reading a disposition off
// it — a fixture the parser dropped upstream yields an empty diagnostic list,
// which is indistinguishable from a clean load unless the capture is asserted
// separately.
//
// ANTI-VACUITY. Every cell asserts an ORDERED WHOLE-LIST equality over the
// UNFILTERED `doc.diagnostics`, each entry rendered as
// `[line:column] severity code: message` — never containment — so neither an
// extra diagnostic nor one at a moved coordinate can hide. Group (A) asserts
// the absence of the phantom's construct text positively BESIDE that equality,
// so the cell states the bug's own claim and not only a count. `Nope`, `Sub`,
// `Cat` and `b` are declared and imported nowhere.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const PARSE_REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${PARSE_REGISTRY_PATH}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/** The type-side refusal of the retained field's junk type — SANCTIONED here. */
const SCHEMA_NOT_EXPR = "theta/parse/schema-type-not-expression";
/** The body-level refusal of the token from which no further `Field` derives — SANCTIONED. */
const MALFORMED_FIELD = "theta/parse/malformed-schema-field";
/** The row the phantom comma-separation line renders under — this bug's subject. */
const UNSUPPORTED = "theta/parse/unsupported-feature";
/** The `let` / `fn`-parameter member of the not-expression family, for the capture bounds. */
const ANNOT_NOT_EXPR = "theta/parse/annotation-type-not-expression";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a row whose *Message* moved reds by naming the registry page rather than by a
 * bare `undefined` comparison downstream. No message prose is written out here.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(PARSE_REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${PARSE_REGISTRY_PATH} must carry the Message row for ${code}`,
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

/**
 * The construct text the phantom renders — held as the registry's own
 * construct-row string (placeholder-rendering-a.md line 93) so group (A)'s
 * absence assertion cannot drift from the emission it forbids.
 */
const COMMA_CONSTRUCT = "schema fields must be comma-separated";

/** One expected diagnostic, rendered as `[line:col] error code: message`. */
function at(
  position: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  return `[${position}] error ${code}: ${msg(code, fills)}`;
}

/** The type-side refusal, rendered at the declaration's own start for `schema S`. */
function schemaRefusal(): string {
  return at("6:1", SCHEMA_NOT_EXPR, [["<X>", "S"]]);
}

/** The body-level malformed-field refusal, rendered at the offending token. */
function malformedAt(position: string): string {
  return at(position, MALFORMED_FIELD);
}

/** The genuine missing-comma refusal, rendered at the boundary token the source spells. */
function commaLineAt(position: string): string {
  return at(position, UNSUPPORTED, [["<construct>", COMMA_CONSTRUCT]]);
}

// ===========================================================================
// The parse harness.
// ===========================================================================

/** The frontmatter every fixture carries; its length puts the body on line 6. */
const FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

/** One parsed body: its rendered diagnostic list and its captured schema fields. */
interface Row {
  readonly label: string;
  readonly entries: readonly string[];
  readonly declared: readonly string[];
  readonly fields: ReadonlyArray<readonly [string, string]>;
  readonly doc: ThetaDocument;
}

/** A `mode: prompt` theta whose body is `body` on line 6, parsed once. */
function theta(body: string): Row {
  const doc = parseDoc(`${FRONTMATTER}${body}\n"ok"\n`, "b0285.theta");
  const schemas = doc.body.statements.filter((s) => s.kind === "schema");
  return {
    label: body,
    entries: doc.diagnostics.map((d: Diagnostic) => {
      const where =
        d.range === undefined
          ? "unlocated"
          : `${d.range.start.line}:${d.range.start.column}`;
      return `[${where}] ${d.severity} ${d.code}: ${d.message}`;
    }),
    declared: schemas.map((s) => (s as { name: string }).name),
    fields: schemas.flatMap(
      (s) =>
        ((s as unknown as { fields?: ReadonlyArray<{ name: string; typeSource: string }> })
          .fields ?? []).map((f) => [f.name, f.typeSource] as const),
    ),
    doc,
  };
}

/**
 * Assert the fixture captured exactly the schema declarations it names, before
 * any disposition is read off it. A body the parser dropped upstream yields an
 * empty diagnostic list, which reads exactly like a clean load — this is the
 * precondition, failing loudly rather than skipping.
 */
function expectDeclared(rows: readonly Row[], names: readonly string[]): void {
  expect(
    rows.map((r) => [r.label, r.declared]),
    `precondition: every fixture must capture exactly the schema declarations ${JSON.stringify(names)}`,
  ).toEqual(rows.map((r) => [r.label, names]));
}

/** Assert each row's ordered, whole, rendered diagnostic list. */
function expectEntries(rows: readonly Row[], expected: readonly (readonly string[])[]): void {
  expect(rows.map((r) => [r.label, r.entries])).toEqual(
    rows.map((r, i) => [r.label, expected[i]]),
  );
}

/**
 * Assert registration is refused. `ThetaDocument` exposes `diagnostics` and
 * `body` and carries no `registered` field, so refusal is expressed as the
 * composition root's own gate reads it: at least one error-severity
 * `theta/parse/*` (or `theta/load/*`) diagnostic denies registration. Bug 0285
 * §Non-goals requires this of every offender and control row alike — no route
 * may admit any of this text.
 */
function expectRefused(rows: readonly Row[]): void {
  expect(
    rows.map((r) => [
      r.label,
      r.doc.diagnostics.some(
        (d: Diagnostic) =>
          d.severity === "error" &&
          (d.code.startsWith("theta/parse/") || d.code.startsWith("theta/load/")),
      ),
    ]),
    "registration is refused throughout: the fix withholds a phantom line, never an error-severity refusal",
  ).toEqual(rows.map((r) => [r.label, true]));
}

/** Assert no diagnostic of any row states the comma-separation construct. */
function expectNoCommaLine(rows: readonly Row[]): void {
  expect(
    rows.map((r) => [r.label, r.entries.filter((e) => e.includes(COMMA_CONSTRUCT))]),
    "a body spelling ONE field has no separator position, so no diagnostic may state that its fields are not comma-separated",
  ).toEqual(rows.map((r) => [r.label, []]));
}

// ===========================================================================
// (A) The offenders — the phantom is withheld, the sanctioned pair survives.
// ===========================================================================

/**
 * The five offender bodies, representative of the bug document's sixteen-row
 * matrix, with the column of the residue token the malformed-field line is
 * anchored on. Those columns are MEASURED at HEAD and unchanged by the fix,
 * which withholds one line and moves none: `Sub` at column 20, `b` at column
 * 17, `b` (after `string.`) at column 22.
 */
const OFFENDERS: ReadonlyArray<readonly [string, string]> = [
  ["schema S { a: Nope.Sub }", "6:20"],
  ["schema S { a: Nope.Sub<integer> }", "6:20"],
  ["schema S { a: a-b }", "6:17"],
  ["schema S { a: a-b<integer> }", "6:17"],
  ["schema S { a: string.b }", "6:22"],
];

describe("b0285 (A) — one written mistake in a schema field type draws the sanctioned pair and no comma line", () => {
  it("b0285-A: five offender bodies draw schema-type-not-expression beside malformed-schema-field, and nothing else", () => {
    // RED at HEAD: each of these five lists carries a THIRD diagnostic, the
    // comma-separation `theta/parse/unsupported-feature` at the same column as
    // the malformed-field line. The residue it names is a token the author
    // wrote INSIDE the type (`Sub`, `b`), which the `stopAtFieldBoundary` arm
    // (src/parser/theta-document.ts line 3967) left at the cursor because the
    // `.` or `-` ahead of it joined the capture and satisfied that arm's only
    // gate. Post-fix the separator arm (line 3305) withholds the line, because
    // the captured `typeSource` ends on that punctuation and so ends no `Type`
    // atom.
    //
    // The two surviving lines are the pair
    // code-registry-parse.md line 106 pins verbatim for `schema S { a: -1 }`,
    // which group (B) asserts unmoved — the subject's target reading is that
    // pair, not a single line.
    const rows = OFFENDERS.map(([body]) => theta(body));
    expectDeclared(rows, ["S"]);
    expectEntries(
      rows,
      OFFENDERS.map(([, residue]) => [schemaRefusal(), malformedAt(residue)]),
    );
    expectNoCommaLine(rows);
    expectRefused(rows);
  });

  it("b0285-A-splitter: the captured `typeSource` shard is unmoved — the fix does not touch the capture", () => {
    // GREEN at HEAD and after, and asserted for exactly that reason: the route
    // withholds an EMISSION at the separator arm and leaves `parseType`'s stop
    // untouched (§Fix, final paragraph — a splitter change moves
    // `schema S { a: -1 }`'s pinned reading). These shards are therefore a pin
    // on the rejected route, not an expectation about correct capture: the
    // author wrote `Nope.Sub` and the field retains `Nope.`.
    const rows = [theta("schema S { a: Nope.Sub }"), theta("schema S { a: string.b }")];
    expectDeclared(rows, ["S"]);
    expect(
      rows.map((r) => [r.label, r.fields]),
      "the shard is what the retained field carries before and after the fix; a changed shard means the splitter moved",
    ).toEqual([
      ["schema S { a: Nope.Sub }", [["a", "Nope."]]],
      ["schema S { a: string.b }", [["a", "string."]]],
    ]);
  });
});

// ===========================================================================
// (B) The registry's pinned sanctioned pair — LOCKED.
// ===========================================================================

describe("b0285 (B) — the sanctioned two-line reading is byte-stable", () => {
  it("b0285-B: `schema S { a: -1 }` and `schema S { a: 1-2 }` keep both codes at their measured columns", () => {
    // GREEN at HEAD and after. These are code-registry-parse.md line 106's own
    // verbatim example of the co-firing this bug's target reading converges on
    // ("`schema S { a: -1 }` draws this row BESIDE
    // `theta/parse/malformed-schema-field`"). The boundary token in each is a
    // NUMBER, which the separator arm already excludes, so the comma line was
    // never in play here; what these cells lock is that the withhold's
    // predicate touches no emission at this shape and that the capture is
    // unmoved (`-`, `1-`), which a splitter-side route would break.
    const rows = [theta("schema S { a: -1 }"), theta("schema S { a: 1-2 }")];
    expectDeclared(rows, ["S"]);
    expectEntries(rows, [
      [schemaRefusal(), malformedAt("6:16")],
      [schemaRefusal(), malformedAt("6:17")],
    ]);
    expectNoCommaLine(rows);
    expectRefused(rows);
    expect(
      rows.map((r) => [r.label, r.fields]),
      "the retained field's shard is line 106's own — a route that captured `-1` would delete that row's malformed-field line",
    ).toEqual([
      ["schema S { a: -1 }", [["a", "-"]]],
      ["schema S { a: 1-2 }", [["a", "1-"]]],
    ]);
  });
});

// ===========================================================================
// (C) The true positives the separator arm exists for.
// ===========================================================================

describe("b0285 (C) — a genuinely missing comma keeps its one line at the boundary the source spells", () => {
  it("b0285-C: three comma-less bodies keep exactly the comma line, and keep both fields", () => {
    // GREEN at HEAD and after — the anti-over-broadness lock, and the cell that
    // pins the predicate's ADMITTED trailing characters. Each row's boundary
    // predecessor ends a `Type` atom by a different character: `string` ends on
    // an identifier character, `array<integer>` on `>`, `"x"` on `"`. A
    // withhold keyed on anything coarser than "the capture ends a `Type` atom"
    // — on the mere presence of a `.` or `-` anywhere, or on the boundary
    // token's kind — reds here by silencing a diagnostic the author earned.
    const rows = [
      theta("schema S { a: string b: integer }"),
      theta("schema S { a: array<integer> b: string }"),
      theta('schema S { a: "x" b: integer }'),
    ];
    expectDeclared(rows, ["S"]);
    expectEntries(rows, [
      [commaLineAt("6:22")],
      [commaLineAt("6:30")],
      [commaLineAt("6:19")],
    ]);
    expectRefused(rows);
    expect(
      rows.map((r) => [r.label, r.fields]),
      "a genuine missing comma keeps both fields the author wrote",
    ).toEqual([
      ["schema S { a: string b: integer }", [["a", "string"], ["b", "integer"]]],
      [
        "schema S { a: array<integer> b: string }",
        [["a", "array<integer>"], ["b", "string"]],
      ],
      ['schema S { a: "x" b: integer }', [["a", '"x"'], ["b", "integer"]]],
    ]);
  });

  it("b0285-C-clean: a comma-separated body loads clean and registers", () => {
    // GREEN at HEAD and after. The well-formed neighbour of the group above:
    // zero diagnostics, so the withhold cannot be mistaken for a route that
    // suppresses a whole body's judgement.
    const r = theta("schema S { a: string, b: integer }");
    expectDeclared([r], ["S"]);
    expectEntries([r], [[]]);
    expect(
      [[r.label, r.fields]],
      "both fields are captured and nothing is refused",
    ).toEqual([
      ["schema S { a: string, b: integer }", [["a", "string"], ["b", "integer"]]],
    ]);
  });
});

// ===========================================================================
// (D) The depth and capture bounds — outside the subject, unmoved.
// ===========================================================================

describe("b0285 (D) — the same text one level down, and at a non-schema capture, keeps its single line", () => {
  it("b0285-D-depth: a generic argument and an inline object field capture the text whole", () => {
    // GREEN at HEAD and after. The `stopAtFieldBoundary` arm is gated on
    // `depth === 0` (src/parser/theta-document.ts line 3967), so no boundary is
    // manufactured inside `array<…>` or `{…}` and the whole written text
    // reaches the type-side judgement as one fragment. These rows bound the
    // subject: a withhold applied at the wrong site could only red here by
    // removing this single line.
    const rows = [
      theta("schema S { a: array<Nope.Sub> }"),
      theta("schema S { a: {b: Nope.Sub} }"),
    ];
    expectDeclared(rows, ["S"]);
    expectEntries(rows, [[schemaRefusal()], [schemaRefusal()]]);
    expectNoCommaLine(rows);
    expectRefused(rows);
  });

  it("b0285-D-capture: a `let` annotation and an `fn` parameter type pass no field-boundary flag", () => {
    // GREEN at HEAD and after. `parseType(true)` has exactly one caller
    // (src/parser/theta-document.ts line 3279, inside `parseSchemaObjectBody`),
    // so these captures never reach the arm at all and keep the
    // not-expression family's own member for their positions
    // (code-registry-parse.md line 107), naming the binder rather than the
    // declaration.
    const rows = [
      theta("let x: Nope.Sub<integer> = 1"),
      theta("fn g(p: Nope.Sub<integer>): integer { 1 }"),
    ];
    expectDeclared(rows, []);
    expectEntries(rows, [
      [at("6:1", ANNOT_NOT_EXPR, [["<name>", "x"]])],
      [at("6:1", ANNOT_NOT_EXPR, [["<name>", "p"]])],
    ]);
    expectNoCommaLine(rows);
    expectRefused(rows);
  });

  it("b0285-D-0284: `schema S { a: f()<integer> }` keeps bug 0284's landed single-line reading", () => {
    // GREEN at HEAD and after — LOCKED. This is the spelling bug 0284's witness
    // scoped its `schema` cell to
    // (tests/b0284-non-identifier-applied-generic-head.test.ts, cell
    // `b0284-B-schema`), precisely because its text carries no `.` and no `-`
    // and so manufactures no boundary. Bug 0285 §Non-goals reopens no head
    // judgement; this cell states that.
    const r = theta("schema S { a: f()<integer> }");
    expectDeclared([r], ["S"]);
    expectEntries([r], [[schemaRefusal()]]);
    expectNoCommaLine([r]);
    expectRefused([r]);
    expect(
      [[r.label, r.fields]],
      "the whole application is captured as one fragment, which is why this neighbour draws one line",
    ).toEqual([["schema S { a: f()<integer> }", [["a", "f()<integer>"]]]]);
  });
});

// ===========================================================================
// (F) The absorbed-operator consequence of the same predicate.
// ===========================================================================

describe("b0285 (F) — an absorbed trailing operator ends no `Type` atom either", () => {
  it("b0285-F: `schema S { a: Cat + b: integer }` draws the type-side refusal alone", () => {
    // RED at HEAD: this body draws TWO diagnostics, the type-side refusal at
    // [6:1] and the comma-separation line at [6:21]. It is a DELIBERATE
    // CONSEQUENCE of the same predicate rather than a separate subject: the
    // capture is `Cat+` (an operator absorbed with no operand behind it, which
    // code-registry-parse.md line 106 lists among the fragments it refuses),
    // and `+` is not one of the characters a `Type` atom can end on, so the
    // withhold at the separator arm covers this shape too. The type-side
    // refusal — the line naming the fault the author actually made — stands,
    // and both fields stay captured, so nothing here goes unreported.
    const r = theta("schema S { a: Cat + b: integer }");
    expectDeclared([r], ["S"]);
    expectEntries([r], [[schemaRefusal()]]);
    expectNoCommaLine([r]);
    expectRefused([r]);
    expect(
      [[r.label, r.fields]],
      "the withheld line removes no field: the second field is captured exactly as it is at HEAD",
    ).toEqual([
      ["schema S { a: Cat + b: integer }", [["a", "Cat+"], ["b", "integer"]]],
    ]);
  });
});

// ===========================================================================
// (DIAG-2) The registry rows this file asserts against exist and are closed.
// ===========================================================================

describe("b0285 (DIAG-2) — every asserted code has a closed-set registry row", () => {
  it("b0285-DIAG-2: all four codes carry an E parse row, and the construct text is the registry's own", () => {
    // DIAG-2: the registry is closed (`reconcileClosedSet`,
    // tools/code-registry/index.js), so a code a test asserts must have a row.
    // This route mints NOTHING — it withholds one emission of a pre-existing
    // row — and owes one *Trigger*-side sentence stating the withhold, which
    // belongs to the implementer, not to this witness: nothing here asserts
    // registry prose. This cell fails loudly on an absent row rather than
    // letting `msg` substitute into an undefined template.
    const rows = [SCHEMA_NOT_EXPR, MALFORMED_FIELD, UNSUPPORTED, ANNOT_NOT_EXPR].map((code) => {
      const row = PARSE_REGISTRY.find((x) => x.code === code);
      return [code, row?.severity, row?.phase] as const;
    });
    expect(rows, "DIAG-2: each asserted code must carry a closed-set row").toEqual([
      [SCHEMA_NOT_EXPR, "E", "parse"],
      [MALFORMED_FIELD, "E", "parse"],
      [UNSUPPORTED, "E", "parse"],
      [ANNOT_NOT_EXPR, "E", "parse"],
    ]);
    expect(
      readFileSync(
        fileURLToPath(
          new URL("../docs/spec_topics/diagnostics/placeholder-rendering-a.md", import.meta.url),
        ),
        "utf8",
      ),
      "the construct text group (A) forbids is the one the construct table fixes for this input class",
    ).toContain(COMMA_CONSTRUCT);
  });
});
