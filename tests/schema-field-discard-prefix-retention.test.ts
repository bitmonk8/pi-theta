import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0133 — `parseSchemaObjectBody`'s three recovery arms discard every field
// the body has already captured, so a body whose FIRST token is a plain
// `ident: Type` field reports `theta/parse/empty-schema-body` against the
// DECLARATION ("'S' has no fields") over a source that spells up to three
// fields; the same discard drops the `by` key, turns a same-file declaration
// into `theta/parse/unresolved-named-type` at a constructor site, and on an
// unbalanced body consumes the rest of the file
// (docs/bugs/0133-field-list-discard-recovery-unsettled.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md §`SchemaDecl` / `SchemaShape` —
//     `SchemaShape ::= "{" Field ("," Field)* ","? "}"` is a SEQUENCE, so what
//     fails to derive on these inputs is ONE element of it. The prefix derives.
//     That is §Expected behaviour's Reading A, which the bug document
//     adjudicates as better supported ("**Reading A is better supported**",
//     four reasons) and which §Fix (a) implements.
//   - docs/spec_topics/diagnostics/code-registry-parse.md §row
//     `theta/parse/empty-schema-body` — its *Trigger* admits "an empty object
//     body (`schema X { }`), a body whose FIRST token is not a plain
//     `ident: Type` field list, or no shape at all". None of the captured-prefix
//     inputs below is inside those clauses, and DIAG-2 makes the *Trigger* the
//     canonical condition, so the emission is a defect against the row.
//   - docs/spec_topics/diagnostics/code-registry-parse.md §row
//     `theta/parse/by-on-object-schema` — a `by` clause on an object body is
//     inside this row's *Trigger*, and the discard makes the row silently not
//     fire (group (6)).
//   - docs/spec_topics/diagnostics/code-registry-parse.md §row
//     `theta/parse/unresolved-named-type` — the constructor-position clause
//     ("a `schema` without an object body … is not constructible") is what the
//     discard turns a spelled-out object body into (group (7)).
//   - docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-4 — the *Message*
//     column is normative, so every expected string here is read out of the
//     registry through `registryMessage`, exactly as
//     `tests/brace-rooted-union-arm-capture.test.ts` and
//     `tests/inline-empty-object-type.test.ts` do. No message prose is copied.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md §"located-site
//     classification" — a parse-phase emission carries a single token span in
//     one source file. The RANGE is how the offending construct is named here:
//     the new row's *Message* is placeholder-free (asserted in group (R)), so a
//     route that moves the subject without the anchor, or the anchor without
//     the subject, reds on exactly one of them (bug doc §Fix, final paragraph).
//
// EXPECTED CONCRETELY (§Expected behaviour under Reading A, §Fix (a), and the
// settled route): the three discard arms converge on one helper that (1)
// consumes the balance of the brace group, (2) returns `null` for an EMPTY
// captured prefix — byte-exact today's `empty-schema-body` disposition, which
// is what keeps the no-prefix pins of bug 0045 (e3) and bug 0033 (e2) green —
// and (3) otherwise emits exactly ONE `theta/parse/malformed-schema-field`
// anchored at the OFFENDING TOKEN's own range and returns the captured prefix.
// The offending token per arm: the non-field-name token (arm 1), the non-string
// wire-name token (arm 2), and the FIELD-NAME token (arm 3 — the field that
// carries no type, NOT the token standing where the `:` should be, which for
// `schema S { f: Cat Cat }` is the closing `}` the author wrote correctly).
//
// Retaining the prefix is the point of the fix, so three consequences are
// asserted beside it: `by-on-object-schema` fires beside the new line and the
// statement carries `by`; the `unresolved-named-type` cascade at a constructor
// site disappears; and the retained field list reaches the checker-time
// `walkStmt` block, so a retained field whose TYPE source is junk also draws
// `theta/parse/schema-type-not-expression` (cell 9c).
//
// RESIDUAL, PINNED AS TODAY'S BEHAVIOUR: `skipBraceRemainder`'s end-of-input
// reach. Group (8)'s unbalanced cells assert the statement list and
// `doc.body.tail` and pin the SILENT LOSS of the document remainder as expected
// output — bug 0133's recorded residual, deliberately not fixed by this route
// (§Fix (a)4 makes the resynchronisation a second decision with its own blast
// radius). Only those cells can red on the lost remainder, so when that
// residual is taken they are where it lands.
//
// RE-DERIVED BASELINE. Every expectation below was measured twice at HEAD
// f5d0d125 (0.198.0), offline and deterministic: once as-is (the observed
// column) and once with the §Fix (a) helper applied as a temporary probe (the
// expected column), so both directions of every assertion are known reachable.
// The probe was reverted byte-exact. Three measurements correct the bug
// document's §Reproduction, which predates ~65 minors:
//   - the keyword-name family (group (4)) draws
//     `theta/parse/reserved-keyword-as-identifier` and RETAINS its fields at
//     HEAD; the document quotes `diags :: []`;
//   - `schema S { a: string, b: }` (cell 9b) draws
//     `theta/parse/schema-type-not-expression` at HEAD; the document quotes it
//     as a clean loader;
//   - the inline-half rows (group (9)) draw
//     `theta/parse/inline-field-name-not-identifier` at HEAD; the document
//     quotes `[]`.
// All three are unchanged by this route and are controls here.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string: the observables are the
// parse-time diagnostic list (code, range, message), the parsed `schema`
// statements' field sources and `by` key, the statement list and the document
// tail — all fully determined at the parse seam. An integration tier would add
// a session round-trip that can observe none of the AST halves, and a live tier
// would make the assertion stochastic on top of that. `parseDoc`
// (tests/helpers/e2e-s1.ts) is the shipped lexer plus `parseThetaDocument`
// behind the standard inert `parseDeps` double — the harness the bug document's
// own §Reproduction used.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. The
// registry lookup asserts its row's presence (and, for the new row, its
// placeholder-free *Message*) before any template is used, so a missing or
// reworded row reds by NAMING the registry rather than by a silently-wrong
// expectation. Group (0) asserts codes and ranges only — no registry read — so
// the BEHAVIOUR half of every claim reds independently of whether the row has
// landed yet.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

const MALFORMED_FIELD = "theta/parse/malformed-schema-field";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const BY_ON_OBJECT = "theta/parse/by-on-object-schema";
const UNSUPPORTED = "theta/parse/unsupported-feature";
const RESERVED_KEYWORD = "theta/parse/reserved-keyword-as-identifier";
const SCHEMA_TYPE_NOT_EXPR = "theta/parse/schema-type-not-expression";
const MISSING_FIELD = "theta/parse/missing-object-field";
const UNRESOLVED_TYPE = "theta/parse/unresolved-named-type";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const INLINE_NOT_IDENT = "theta/parse/inline-field-name-not-identifier";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
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

/** One rendered error diagnostic, in the shape `diagLines` produces. */
function line(code: string, at: string, message: string): string {
  return `error ${code} @${at}: ${message}`;
}

/**
 * The new row (§Fix (a)1), read from the registry like every other expected
 * string. The offending construct is named by the diagnostic's RANGE, so the
 * *Message* interpolates nothing — a `<construct>`- or `<token>`-shaped
 * placeholder would extend the closed `<construct>` table
 * (docs/spec_topics/diagnostics/placeholder-rendering-a.md), which is bug
 * 0063's subject and out of this route's bounds.
 */
function malformedFieldLine(at: string): string {
  return line(MALFORMED_FIELD, at, msg(MALFORMED_FIELD, []));
}

/** `empty-schema-body` with the DECLARATION subject (the no-prefix family). */
function declarationEmptyLine(at: string, name: string): string {
  return line(EMPTY_BODY, at, msg(EMPTY_BODY, [["<X>", name]]));
}

/** `empty-schema-body` with the INLINE subject — bug 0045's half, untouched here. */
function inlineEmptyLine(at: string): string {
  return line(EMPTY_BODY, at, msg(EMPTY_BODY, [["<X>", "{}"]]));
}

/** `by-on-object-schema`, whose *Message* interpolates nothing. */
function byOnObjectLine(at: string): string {
  return line(BY_ON_OBJECT, at, msg(BY_ON_OBJECT, []));
}

/** `unsupported-feature` with one of its `<construct>` tails. */
function unsupportedLine(at: string, construct: string): string {
  return line(UNSUPPORTED, at, msg(UNSUPPORTED, [["<construct>", construct]]));
}

/** `reserved-keyword-as-identifier` — bug 0153's arm at the field-name position. */
function reservedKeywordLine(at: string, keyword: string): string {
  return line(RESERVED_KEYWORD, at, msg(RESERVED_KEYWORD, [["<keyword>", keyword]]));
}

/** `schema-type-not-expression` — bug 0061's field-type last resort. */
function typeNotExpressionLine(at: string, decl: string): string {
  return line(SCHEMA_TYPE_NOT_EXPR, at, msg(SCHEMA_TYPE_NOT_EXPR, [["<X>", decl]]));
}

/** `missing-object-field` at a constructor site. */
function missingFieldLine(at: string, field: string, schema: string): string {
  return line(
    MISSING_FIELD,
    at,
    msg(MISSING_FIELD, [
      ["<field>", field],
      ["<schema>", schema],
    ]),
  );
}

/** `unresolved-named-type` — the cascade the retained prefix removes. */
function unresolvedTypeLine(at: string, name: string): string {
  return line(UNRESOLVED_TYPE, at, msg(UNRESOLVED_TYPE, [["<name>", name]]));
}

/** `let-rhs-type-mismatch` at the annotation control of group (7). */
function letMismatchLine(
  at: string,
  name: string,
  expected: string,
  actual: string,
): string {
  return line(
    LET_RHS,
    at,
    msg(LET_RHS, [
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `inline-field-name-not-identifier` — the inline half, unmoved by this route. */
function inlineNotIdentifierLine(at: string, field: string): string {
  return line(INLINE_NOT_IDENT, at, msg(INLINE_NOT_IDENT, [["<field>", field]]));
}

// ===========================================================================
// Fixtures and observation helpers.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by a tail expression. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** `l:c-l:c`, the located-site rendering every assertion below anchors on. */
function at(range: {
  readonly start: { readonly line: number; readonly column: number };
  readonly end: { readonly line: number; readonly column: number };
}): string {
  return `${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`;
}

/**
 * Every diagnostic rendered `error <code> @<range>: <message>`, in
 * `(file, line, col)` order — `assembleDiagnostics` (src/diagnostics/diagnostic.ts)
 * sorts, so this is NOT emission order. A diagnostic carrying no range is
 * rendered `@-` so its absence of a located site reds rather than throwing.
 */
function diagLines(doc: ThetaDocument): readonly string[] {
  return doc.diagnostics.map((d) =>
    `${d.severity} ${d.code} @${d.range === undefined ? "-" : at(d.range)}: ${d.message}`,
  );
}

/** Codes and located sites alone — no registry read, so a behaviour red is isolated. */
function diagSites(doc: ThetaDocument): readonly string[] {
  return doc.diagnostics.map(
    (d) => `${d.code} @${d.range === undefined ? "-" : at(d.range)}`,
  );
}

/** One field of a captured object schema: its name, wire name and type source. */
interface FieldShape {
  readonly name: string;
  readonly wireName: string | null;
  readonly typeSource: string;
}

interface SchemaShape {
  readonly name: string;
  /** `null` iff the declaration carries NO `fields` key — the discard's signature. */
  readonly fields: readonly FieldShape[] | null;
  /** `null` iff the declaration carries no `by` key, which the discard also drops. */
  readonly by: string | null;
}

function schemaShapes(doc: ThetaDocument): readonly SchemaShape[] {
  return doc.body.statements
    .filter((s): s is SchemaDecl => s.kind === "schema")
    .map((d) => ({
      name: d.name,
      fields:
        d.fields === undefined
          ? null
          : d.fields.map((f) => ({
              name: f.name,
              wireName: f.wireName ?? null,
              typeSource: f.typeSource,
            })),
      by: (d as { readonly by?: string }).by ?? null,
    }));
}

/**
 * The whole observable of one fixture. Both halves are mandatory in every cell:
 * the keyword-name family moves NO diagnostic across this route while its field
 * list is the thing under assertion, and the unbalanced cells move no
 * diagnostic count while the statement list and the document tail are the
 * observables that carry the residual.
 */
interface Observed {
  readonly diagnostics: readonly string[];
  readonly schemas: readonly SchemaShape[];
  readonly statementKinds: readonly string[];
  readonly tailPresent: boolean;
}

function observe(src: string): Observed {
  const doc = parseDoc(src, "bug0133.theta");
  return {
    diagnostics: diagLines(doc),
    schemas: schemaShapes(doc),
    statementKinds: doc.body.statements.map((s) => s.kind),
    tailPresent: doc.body.tail !== null,
  };
}

/** The same observable with the diagnostic half reduced to code + located site. */
function observeSites(src: string): {
  readonly sites: readonly string[];
  readonly schemas: readonly SchemaShape[];
  readonly statementKinds: readonly string[];
  readonly tailPresent: boolean;
} {
  const doc = parseDoc(src, "bug0133.theta");
  return {
    sites: diagSites(doc),
    schemas: schemaShapes(doc),
    statementKinds: doc.body.statements.map((s) => s.kind),
    tailPresent: doc.body.tail !== null,
  };
}

/** The single-`schema`-declaration statement shape every group-(1)-style cell has. */
const ONE_SCHEMA_KINDS = ["schema", "let"] as const;

function fieldA(): FieldShape {
  return { name: "a", wireName: null, typeSource: "string" };
}

// ===========================================================================
// (R) The registry contract of the new row (DIAG-2 / DIAG-4).
//
// RED at HEAD: the row does not exist. This cell's red is "missing registry
// row" and NOTHING else — it reads no parser output at all, so it is the one
// place that separates the registry half of the fix from the behaviour half.
// ===========================================================================

describe("bug 0133 (R) — the new row's registry contract", () => {
  it("R1: the registry carries an E/parse row for the new code whose Message is placeholder-free ", () => {
    const row = REGISTRY.find((r) => r.code === MALFORMED_FIELD);
    expect(
      row,
      `DIAG-2: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ${MALFORMED_FIELD} row (bug 0133 §Fix (a)1)`,
    ).toBeDefined();
    const present = row as RegistryRow;
    expect(present.severity, "the row's severity column").toBe("E");
    expect(present.phase, "the row's phase column").toBe("parse");
    // The offending construct is named by the RANGE, not by the Message: a
    // placeholder here would extend the closed `<construct>` table
    // (placeholder-rendering-a.md), which bug 0063 owns.
    expect(
      present.message,
      "the Message must interpolate nothing — the offending token is named by the diagnostic's range",
    ).not.toMatch(/<[a-z]+>/);
  });
});

// ===========================================================================
// (0) BEHAVIOUR-ONLY reds — codes and located sites, no registry read.
//
// Each cell here is a duplicate of a full-message cell below with the message
// column dropped, so the retained prefix, the new anchor, the retained `by`
// key, the removed cascade and the pinned residual each red on BEHAVIOUR alone
// while the registry row is still absent.
// ===========================================================================

describe("bug 0133 (0) — the retained prefix and the new anchor, without the registry", () => {
  it("0a: `schema S { a: string, 42: integer }` keeps `a` and anchors at the `42` ", () => {
    expect(
      observeSites(body("schema S { a: string, 42: integer }")),
      "0a — the body's FIRST token is a plain `ident: Type` field, so no clause of the " +
        "empty-schema-body Trigger describes this input; the captured prefix survives and the " +
        "line sits on the offending token",
    ).toEqual({
      sites: [`${MALFORMED_FIELD} @4:23-4:25`],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("0b: the three-field loss retains all three fields ", () => {
    expect(
      observeSites(body("schema S { a: string, b: integer, c: boolean, 42: string }")),
      "0b — the loss scales with the prefix at HEAD (three well-formed fields for one bad " +
        "token); every one of them is retained",
    ).toEqual({
      sites: [`${MALFORMED_FIELD} @4:47-4:49`],
      schemas: [
        {
          name: "S",
          fields: [
            fieldA(),
            { name: "b", wireName: null, typeSource: "integer" },
            { name: "c", wireName: null, typeSource: "boolean" },
          ],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("0c: the multi-line body anchors at the offending token, not at the declaration span ", () => {
    // The load-bearing range cell: at HEAD the single line spans the whole
    // declaration (`@4:1-9:2`, `finishObjectSchema`'s
    // `spanRange(kw.range, prevRange())`). The offending token is on line 7.
    expect(
      observeSites(
        body("schema S {\n  a: string,\n  b: integer,\n  42: string,\n  c: boolean\n}"),
      ),
      "0c — a diagnostic whose range covers five lines names no construct; the anchor is the " +
        "`42` token's own span",
    ).toEqual({
      sites: [`${MALFORMED_FIELD} @7:3-7:5`],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "integer" }],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("0d: `schema S { f: Cat Cat }` anchors at the FIELD NAME, not at the `}` ", () => {
    // Arm 3's anchor discriminator. The token standing where the `:` should be
    // is the closing `}` at 4:23 — text the author wrote correctly. The
    // offending field is the second `Cat` at 4:19, the field that carries no
    // type. A route that anchored on the `:` position would red here alone.
    // The retained field `f: Cat` reaches the checker-time field-type walk, so
    // the undeclared name `Cat` is now resolved and refused.
    expect(
      observeSites(body("schema S { f: Cat Cat }")),
      "0d — the offending construct is the field with no type, not the brace the author closed",
    ).toEqual({
      sites: [
        `${UNRESOLVED_TYPE} @4:1-4:24`,
        `${UNSUPPORTED} @4:19-4:22`,
        `${MALFORMED_FIELD} @4:19-4:22`,
      ],
      schemas: [
        { name: "S", fields: [{ name: "f", wireName: null, typeSource: "Cat" }], by: null },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("0e: `schema S by kind { a: string, 42: integer }` keeps the `by` key ", () => {
    expect(
      observeSites(body("schema S by kind { a: string, 42: integer }")),
      "0e — the `by` gate reads `fields !== undefined` && `by !== undefined`, so the discard " +
        "makes a registered E-severity row silently not fire; retaining the prefix restores it",
    ).toEqual({
      sites: [`${BY_ON_OBJECT} @4:1-4:44`, `${MALFORMED_FIELD} @4:31-4:33`],
      schemas: [{ name: "S", fields: [fieldA()], by: "kind" }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("0f: the constructor cascade disappears — no `unresolved-named-type` for a same-file schema ", () => {
    // The retained list is `[a: string]` ALONE (the `42:` field and everything
    // after it is consumed by the containment), and the constructor supplies
    // `a`, so the field-set checks are satisfied and report nothing: the only
    // line left is the new one. What must NOT be here is
    // `unresolved-named-type` for `S`, declared two lines up.
    expect(
      observeSites(`${FM}schema S { a: string, 42: integer }\nlet p = S { a: "x" }\np\n`),
      "0f — `collectBodyTypes` records a real field list, so `checkObjectExpr` sees an object " +
        "body and judges the constructor against the retained field set",
    ).toEqual({
      sites: [`${MALFORMED_FIELD} @4:23-4:25`],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("0g: the unbalanced body still loses the file remainder — bug 0133's recorded residual ", () => {
    // RESIDUAL, NOT FIXED: `skipBraceRemainder` consumes to end of input, so
    // `schema T`, `fn g`, the `let` and the tail expression are gone with no
    // diagnostic naming them. §Fix (a)4 leaves the resynchronisation as a
    // second decision. What this route DOES fix is the misattribution: the
    // surviving line anchors at the offending token instead of spanning four
    // unrelated statements.
    expect(
      observeSites(
        `${FM}schema S { a: string, 42: integer\nschema T { b: string }\nfn g() { 1 }\n${TAIL}`,
      ),
      "0g — the anchor moves off the declaration span; the silent statement loss is pinned as " +
        "today's behaviour and is bug 0133's recorded residual",
    ).toEqual({
      sites: [`${MALFORMED_FIELD} @4:23-4:25`],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: ["schema"],
      tailPresent: false,
    });
  });
});

// ===========================================================================
// (1) ARM 1 — the twelve offending token classes, with a captured prefix.
//
// Every row carries the prefix `a: string,`; the column is what follows it.
// All twelve were re-measured at HEAD f5d0d125 and all twelve still reach arm 1
// (one `empty-schema-body` line against the declaration, `fields` absent), so
// none is dropped.
// ===========================================================================

describe("bug 0133 (1) — arm 1: twelve token classes at the field-name position", () => {
  const CASES: ReadonlyArray<readonly [string, string, string]> = [
    ["1a", "42: integer", "4:23-4:25"],
    ["1b", '"b": integer', "4:23-4:26"],
    ["1c", ": integer", "4:23-4:24"],
    ["1d", ", b: integer", "4:23-4:24"],
    ["1e", "| b: integer", "4:23-4:24"],
    ["1f", "(b): integer", "4:23-4:24"],
    ["1g", "[b]: integer", "4:23-4:24"],
    ["1h", "@b: integer", "4:23-4:24"],
    ["1i", "= b: integer", "4:23-4:24"],
    ["1j", "? b: integer", "4:23-4:24"],
    ["1k", "-b: integer", "4:23-4:24"],
    ["1l", "...", "4:23-4:24"],
  ];

  for (const [id, offending, anchor] of CASES) {
    it(`${id}: \`schema S { a: string, ${offending} }\` keeps \`a\` and names the token `, () => {
      expect(
        observe(body(`schema S { a: string, ${offending} }`)),
        `${id} — one line, on the offending token, with the captured prefix retained; the ` +
          "declaration is not the offending construct and 'S' has no fields is false of this source",
      ).toEqual({
        diagnostics: [malformedFieldLine(anchor)],
        schemas: [{ name: "S", fields: [fieldA()], by: null }],
        statementKinds: [...ONE_SCHEMA_KINDS],
        tailPresent: true,
      });
    });
  }
});

// ===========================================================================
// (2) The loss scales with the prefix — three fields, and a multi-line body.
// ===========================================================================

describe("bug 0133 (2) — every captured field survives the recovery", () => {
  it("2a: `{ a: string, b: integer, c: boolean, 42: string }` retains all three ", () => {
    expect(
      observe(body("schema S { a: string, b: integer, c: boolean, 42: string }")),
      "2a — three well-formed fields the source spells; at HEAD the emission names none of them, " +
        "the offending token or the loss",
    ).toEqual({
      diagnostics: [malformedFieldLine("4:47-4:49")],
      schemas: [
        {
          name: "S",
          fields: [
            fieldA(),
            { name: "b", wireName: null, typeSource: "integer" },
            { name: "c", wireName: null, typeSource: "boolean" },
          ],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("2b: the multi-line body's line anchors on line 7 ", () => {
    expect(
      observe(body("schema S {\n  a: string,\n  b: integer,\n  42: string,\n  c: boolean\n}")),
      "2b — the located site is a single token span (diagnostic-shape.md §located-site " +
        "classification), not the declaration's five-line extent",
    ).toEqual({
      diagnostics: [malformedFieldLine("7:3-7:5")],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "integer" }],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });
});

// ===========================================================================
// (3) CONTROLS — the no-prefix family and the genuinely empty body.
//
// §Fix (a)5: these are inside the row's *Trigger* and its *Message* is true of
// them, so the helper returns `null` for an EMPTY captured prefix and their
// bytes do not move. These cells are what keep bug 0045's e3 and bug 0033's e2
// green; a route that reported the offending token here as well would red every
// cell of this group.
// ===========================================================================

describe("bug 0133 (3) — controls: an empty captured prefix keeps the declaration subject", () => {
  it("3a: `schema S { 42: integer }` — byte-identical to today ", () => {
    expect(
      observe(body("schema S { 42: integer }")),
      "3a — the row's first-token clause describes exactly this input, and no field was captured " +
        "for a new line to retain",
    ).toEqual({
      diagnostics: [declarationEmptyLine("4:1-4:25", "S")],
      schemas: [{ name: "S", fields: null, by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("3b: `schema S { \"a\": string }` — bug 0033's e2 and bug 0045's e3 input ", () => {
    expect(
      observe(body('schema S { "a": string }')),
      "3b — the twice-landed no-prefix pin; both cells move together or neither moves, and this " +
        "route moves neither",
    ).toEqual({
      diagnostics: [declarationEmptyLine("4:1-4:25", "S")],
      schemas: [{ name: "S", fields: null, by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("3c: `schema S { | }` — a stray punct alone ", () => {
    expect(
      observe(body("schema S { | }")),
      "3c — same clause, same disposition",
    ).toEqual({
      diagnostics: [declarationEmptyLine("4:1-4:15", "S")],
      schemas: [{ name: "S", fields: null, by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("3d: `schema S { }` — the genuinely empty body, `fields: []` ", () => {
    expect(
      observe(body("schema S { }")),
      "3d — the one observable separating a truly empty body from a discarded one at HEAD: `[]` " +
        "against no `fields` key at all",
    ).toEqual({
      diagnostics: [declarationEmptyLine("4:1-4:13", "S")],
      schemas: [{ name: "S", fields: [], by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("3e: `schema S` — the headless head, the row's third clause ", () => {
    expect(
      observe(body("schema S")),
      "3e — no shape at all; the declaration IS the offending construct here, so the declaration " +
        "subject is correct and stays",
    ).toEqual({
      diagnostics: [declarationEmptyLine("4:1-4:9", "S")],
      schemas: [{ name: "S", fields: null, by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });
});

// ===========================================================================
// (4) CONTROLS — the keyword-name family.
//
// `isFieldName` admits `keyword`, so a reserved spelling is captured as a field
// name and never reaches a discard arm: the arm fires on token KIND, not on
// spelling legality (bug doc §Non-goals). At HEAD these draw bug 0153's
// `reserved-keyword-as-identifier` and RETAIN their fields — the bug document's
// quoted `diags :: []` is stale by ~65 minors. Nothing here moves.
// ===========================================================================

describe("bug 0133 (4) — controls: a keyword IS a field name, so no arm is reached", () => {
  const CASES: ReadonlyArray<readonly [string, string, string]> = [
    ["4a", "let", "4:23-4:26"],
    ["4b", "schema", "4:23-4:29"],
    ["4c", "true", "4:23-4:27"],
    ["4d", "null", "4:23-4:27"],
  ];

  for (const [id, keyword, anchor] of CASES) {
    it(`${id}: \`schema S { a: string, ${keyword}: integer }\` keeps both fields `, () => {
      expect(
        observe(body(`schema S { a: string, ${keyword}: integer }`)),
        `${id} — the reserved spelling is refused by its own row and the field list is untouched ` +
          "by this route",
      ).toEqual({
        diagnostics: [reservedKeywordLine(anchor, keyword)],
        schemas: [
          {
            name: "S",
            fields: [fieldA(), { name: keyword, wireName: null, typeSource: "integer" }],
            by: null,
          },
        ],
        statementKinds: [...ONE_SCHEMA_KINDS],
        tailPresent: true,
      });
    });
  }
});

// ===========================================================================
// (5) The other two discard arms — with a captured prefix, and with none.
//
// Neither arm has any fixture in the suite at HEAD (bug doc §Affected: "Test
// coverage of this defect: none"). The empty-prefix twin of each is the control
// that proves the helper's `null` branch is keyed on the PREFIX and not on the
// arm.
// ===========================================================================

describe("bug 0133 (5) — arm 3 (no `:`) and arm 2 (non-string wire name)", () => {
  it("5a: `schema S { a: string, b }` — arm 3 anchors at the field name `b` ", () => {
    // The token where the `:` should be is the closing `}` at 4:25; the
    // offending field is `b` at 4:23.
    expect(
      observe(body("schema S { a: string, b }")),
      "5a — a field name with no type; the prefix survives and the line names the field, not the " +
        "brace",
    ).toEqual({
      diagnostics: [malformedFieldLine("4:23-4:24")],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("5b: `schema S { a: string, b integer }` — arm 3 with a type-shaped token after the name ", () => {
    expect(
      observe(body("schema S { a: string, b integer }")),
      "5b — a missing `:` rather than a missing type; same arm, same anchor on the field name",
    ).toEqual({
      diagnostics: [malformedFieldLine("4:23-4:24")],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("5c: `schema S { f: Cat Cat }` — the anchor discriminator, full lines ", () => {
    // The comma rule fires first at the boundary token (the second `Cat`), the
    // loop re-enters, and arm 3 takes it. Both lines sit on that token; the
    // retained field `f: Cat` reaches the checker-time field-type walk, which
    // is what draws the `unresolved-named-type` line the discard hid.
    expect(
      observe(body("schema S { f: Cat Cat }")),
      "5c — three lines in (file, line, col) order; the two at 4:19 are emitted in loop order, " +
        "the comma rule before the arm",
    ).toEqual({
      diagnostics: [
        unresolvedTypeLine("4:1-4:24", "Cat"),
        unsupportedLine("4:19-4:22", "schema fields must be comma-separated"),
        malformedFieldLine("4:19-4:22"),
      ],
      schemas: [
        { name: "S", fields: [{ name: "f", wireName: null, typeSource: "Cat" }], by: null },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("5d: CONTROL `schema S { b }` — arm 3 with an EMPTY prefix keeps today's bytes ", () => {
    expect(
      observe(body("schema S { b }")),
      "5d — the helper's `null` branch is keyed on the captured prefix, so an arm-3 body that " +
        "captured nothing keeps the declaration subject",
    ).toEqual({
      diagnostics: [declarationEmptyLine("4:1-4:15", "S")],
      schemas: [{ name: "S", fields: null, by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("5e: `schema S { a: string, b as 42: integer }` — arm 2 anchors at the wire-name token ", () => {
    expect(
      observe(body("schema S { a: string, b as 42: integer }")),
      "5e — the offending token is the non-string wire name at 4:28, not the field name and not " +
        "the `as`",
    ).toEqual({
      diagnostics: [malformedFieldLine("4:28-4:30")],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("5f: `schema S { a: string, b as c: integer }` — an unquoted identifier wire name ", () => {
    expect(
      observe(body("schema S { a: string, b as c: integer }")),
      "5f — same arm, one-character anchor; the wire name must be a string token",
    ).toEqual({
      diagnostics: [malformedFieldLine("4:28-4:29")],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("5g: CONTROL `schema S { b as 42: integer }` — arm 2 with an EMPTY prefix ", () => {
    expect(
      observe(body("schema S { b as 42: integer }")),
      "5g — the empty-prefix twin of 5e",
    ).toEqual({
      diagnostics: [declarationEmptyLine("4:1-4:30", "S")],
      schemas: [{ name: "S", fields: null, by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("5h: CONTROL `schema S { a: string, b as \"wire\": integer }` loads clean ", () => {
    expect(
      observe(body('schema S { a: string, b as "wire": integer }')),
      "5h — the well-formed rename this route must not perturb: the wire name is captured and " +
        "nothing is emitted",
    ).toEqual({
      diagnostics: [],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: "wire", typeSource: "integer" }],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });
});

// ===========================================================================
// (6) The `by kind` pair — a registered row the discard silently suppresses.
// ===========================================================================

describe("bug 0133 (6) — `by-on-object-schema` fires for a body with a bad field too", () => {
  it("6a: `schema S by kind { a: string, 42: integer }` draws BOTH lines ", () => {
    expect(
      observe(body("schema S by kind { a: string, 42: integer }")),
      "6a — the input satisfies the by-on-object-schema Trigger; at HEAD it draws " +
        "empty-schema-body alone and no `by` key, so an author who fixes the token meets a second " +
        "refusal that was true all along",
    ).toEqual({
      diagnostics: [byOnObjectLine("4:1-4:44"), malformedFieldLine("4:31-4:33")],
      schemas: [{ name: "S", fields: [fieldA()], by: "kind" }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("6b: CONTROL `schema S by kind { a: string, b: integer }` — the well-shaped twin ", () => {
    expect(
      observe(body("schema S by kind { a: string, b: integer }")),
      "6b — the twin whose disposition 6a must reach: one line, both fields, `by` retained",
    ).toEqual({
      diagnostics: [byOnObjectLine("4:1-4:43")],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "integer" }],
          by: "kind",
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("6c: CONTROL `schema S by kind { }` — the empty body draws both codes today ", () => {
    expect(
      observe(body("schema S by kind { }")),
      "6c — an empty body keeps `fields: []` and therefore already reaches the `by` gate; " +
        "unchanged by this route",
    ).toEqual({
      diagnostics: [declarationEmptyLine("4:1-4:21", "S"), byOnObjectLine("4:1-4:21")],
      schemas: [{ name: "S", fields: [], by: "kind" }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });
});

// ===========================================================================
// (7) The constructor cascade and its annotation control.
// ===========================================================================

describe("bug 0133 (7) — a same-file declaration is not `unresolved-named-type`", () => {
  it("7a: `let p = S { a: \"x\" }` after a bad-field body draws NO unresolved-named-type ", () => {
    // The retained list is `[a: string]` alone — the containment consumes the
    // offending token and the rest of the brace group — and the constructor
    // supplies `a`, so the field-set checks are satisfied and add no line.
    // Measured with the §Fix (a) helper applied: exactly one diagnostic.
    expect(
      observe(`${FM}schema S { a: string, 42: integer }\nlet p = S { a: "x" }\np\n`),
      "7a — at HEAD this draws `unresolved named type 'S'` for a schema declared two lines above " +
        "it, and hides the field-set checks entirely",
    ).toEqual({
      diagnostics: [malformedFieldLine("4:23-4:25")],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("7b: CONTROL the well-shaped twin draws `missing-object-field` for `b` ", () => {
    expect(
      observe(`${FM}schema S { a: string, b: integer }\nlet p = S { a: "x" }\np\n`),
      "7b — the constructor arm's correctly-attributed disposition, which the discard replaces " +
        "with an unresolved-name claim",
    ).toEqual({
      diagnostics: [missingFieldLine("5:9-5:21", "b", "S")],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "integer" }],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("7c: `let x: S = 1` after a bad-field body — the annotation position is unaffected ", () => {
    expect(
      observe(`${FM}schema S { a: string, 42: integer }\nlet x: S = 1\nx\n`),
      "7c — the cascade is specific to the constructor arm: the annotation still resolves `S` " +
        "before and after, so only the declaration's own line moves",
    ).toEqual({
      diagnostics: [
        malformedFieldLine("4:23-4:25"),
        letMismatchLine("5:1-5:13", "x", "S", "integer"),
      ],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("7d: CONTROL `let x: S = 1` against a well-shaped body ", () => {
    expect(
      observe(`${FM}schema S { a: string, b: integer }\nlet x: S = 1\nx\n`),
      "7d — the annotation control's own disposition, unchanged in both directions",
    ).toEqual({
      diagnostics: [letMismatchLine("5:1-5:13", "x", "S", "integer")],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "integer" }],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });
});

// ===========================================================================
// (8) The unbalanced-body trio — the only cells that can red on the remainder.
//
// `skipBraceRemainder` counts depth from 1 and stops at the matching `}` OR at
// end of input. Balanced: the recovery is scoped and the following declarations
// survive. Unbalanced: `schema T`, `fn g`, the `let` and the document tail are
// consumed with no diagnostic naming them. That loss is bug 0133's RECORDED
// RESIDUAL — pinned here as expected output, because §Fix (a)4 leaves the
// resynchronisation as a second decision with its own blast radius. When the
// residual is taken, 8b and 8c are the cells that red.
// ===========================================================================

describe("bug 0133 (8) — containment: scoped when balanced, end-of-input when not", () => {
  it("8a: CONTROL balanced — the following declarations survive ", () => {
    expect(
      observe(
        `${FM}schema S { a: string, 42: integer }\nschema T { b: string }\nfn g() { 1 }\n${TAIL}`,
      ),
      "8a — the containment §Fix (a)4 keeps: one brace group consumed, nothing beyond it",
    ).toEqual({
      diagnostics: [malformedFieldLine("4:23-4:25")],
      schemas: [
        { name: "S", fields: [fieldA()], by: null },
        {
          name: "T",
          fields: [{ name: "b", wireName: null, typeSource: "string" }],
          by: null,
        },
      ],
      statementKinds: ["schema", "schema", "fn", "let"],
      tailPresent: true,
    });
  });

  it("8b: unbalanced — the file remainder is still lost in silence (RESIDUAL) ", () => {
    expect(
      observe(
        `${FM}schema S { a: string, 42: integer\nschema T { b: string }\nfn g() { 1 }\n${TAIL}`,
      ),
      "8b — one missing `}` costs a second schema, an fn, a let and the tail; no diagnostic names " +
        "any of them. Pinned as today's behaviour: bug 0133's recorded residual",
    ).toEqual({
      diagnostics: [malformedFieldLine("4:23-4:25")],
      schemas: [{ name: "S", fields: [fieldA()], by: null }],
      statementKinds: ["schema"],
      tailPresent: false,
    });
  });

  it("8c: unbalanced through an inline `{ }` field type — same loss (RESIDUAL) ", () => {
    // Two fields are captured here (`b`'s type is the empty inline object, so
    // bug 0045's inline rule owns the `'{}'` subject), then the recovery runs
    // off the end of the file: the comma rule and arm 1 both land on `schema`,
    // the first token of the NEXT statement, which is the `<construct>` tail
    // bug 0063 reports as unlisted. The remainder loss is the same residual as
    // 8b.
    expect(
      observe(`${FM}schema S { a: string, b: { }\nschema T { b: string }\n${TAIL}`),
      "8c — the inline half owns the `'{}'` line; the field list is retained and the tail is " +
        "still gone",
    ).toEqual({
      diagnostics: [
        inlineEmptyLine("4:1-7:2"),
        unsupportedLine("5:1-5:7", "schema fields must be comma-separated"),
        malformedFieldLine("5:1-5:7"),
      ],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "{ }" }],
          by: null,
        },
      ],
      statementKinds: ["schema"],
      tailPresent: false,
    });
  });
});

// ===========================================================================
// (9) CONTROLS — the loop's own non-discarding recovery, the clean neighbours,
// and the inline half at the schema-field position.
//
// The comma-missing rule is the model this route follows: it emits at the
// boundary token and continues parsing "so the dropped field is NOT lost". Cell
// 9c is where the retained prefix newly reaches the checker-time field-type
// walk, which falsifies one sentence of the `schema-type-not-expression` row
// (it states that `schema S { a: -1 }` keeps `empty-schema-body` alone
// "because the malformed field list is dropped whole at parse time"); that
// sentence is the implementer's registry correction, in the same commit
// (DIAG-2).
// ===========================================================================

describe("bug 0133 (9) — controls: the neighbours this recovery must not move", () => {
  it("9a: CONTROL `schema S { a: string b: integer }` keeps both fields ", () => {
    expect(
      observe(body("schema S { a: string b: integer }")),
      "9a — the loop's own non-discarding recovery, one token away from the discard: it names the " +
        "boundary and loses nothing",
    ).toEqual({
      diagnostics: [unsupportedLine("4:22-4:23", "schema fields must be comma-separated")],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "integer" }],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("9b: CONTROL `schema S { a: string, b: }` — an unterminated field type ", () => {
    expect(
      observe(body("schema S { a: string, b: }")),
      "9b — no discard arm is reached: the field is captured with an empty type source and bug " +
        "0061's last resort refuses it. The bug document's quoted clean load is stale",
    ).toEqual({
      diagnostics: [typeNotExpressionLine("4:1-4:27", "S")],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "" }],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("9c: `schema S { a: -1 }` — the retained field's junk type reaches the field-type walk ", () => {
    // The capture stops after the `-`, so the offending token is the `1`. The
    // retained field `a: -` then reaches the checker-time walk that the absent
    // `fields` key gated off, which is where the second line comes from.
    expect(
      observe(body("schema S { a: -1 }")),
      "9c — two lines: the field-type refusal the retained list unlocks, and the new line on the " +
        "offending token",
    ).toEqual({
      diagnostics: [
        typeNotExpressionLine("4:1-4:19", "S"),
        malformedFieldLine("4:16-4:17"),
      ],
      schemas: [
        { name: "S", fields: [{ name: "a", wireName: null, typeSource: "-" }], by: null },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("9d: CONTROL `schema S { a: string, b: integer }` loads clean ", () => {
    expect(
      observe(body("schema S { a: string, b: integer }")),
      "9d — the well-formed body, inside GOV-15's loads-cleanly set; no route here may move it",
    ).toEqual({
      diagnostics: [],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "integer" }],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("9e: CONTROL the optional trailing comma loads clean ", () => {
    expect(
      observe(body("schema S { a: string, b: integer, }")),
      "9e — `SchemaShape`'s `,\"?\"` tail: the loop's `}` exit runs on the iteration after the " +
        "trailing comma, which is not a discard arm",
    ).toEqual({
      diagnostics: [],
      schemas: [
        {
          name: "S",
          fields: [fieldA(), { name: "b", wireName: null, typeSource: "integer" }],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("9f: CONTROL the inline half one level down does not move ", () => {
    expect(
      observe(body("schema S { a: string, b: {c: integer, 42: string} }")),
      "9f — the identical malformation one level in is the inline field loop's, judged by its own " +
        "row; the document-level capture keeps the text",
    ).toEqual({
      diagnostics: [inlineNotIdentifierLine("4:1-4:52", "42")],
      schemas: [
        {
          name: "S",
          fields: [
            fieldA(),
            { name: "b", wireName: null, typeSource: "{c: integer, 42: string}" },
          ],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("9g: CONTROL the inline half as the ONLY field ", () => {
    expect(
      observe(body("schema S { f: {a: string, 42: integer} }")),
      "9g — no captured prefix at the document level either, and still no discard: the brace group " +
        "is one field type",
    ).toEqual({
      diagnostics: [inlineNotIdentifierLine("4:1-4:41", "42")],
      schemas: [
        {
          name: "S",
          fields: [
            { name: "f", wireName: null, typeSource: "{a: string, 42: integer}" },
          ],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("9h: CONTROL an empty inline object as a mid-list field keeps all three fields ", () => {
    expect(
      observe(body("schema S { a: string, f: {}, g: integer }")),
      "9h — bug 0095's fixed route: the inline subject renders the author's own two bytes and " +
        "every field survives, which is the disposition this route brings the declaration half to",
    ).toEqual({
      diagnostics: [inlineEmptyLine("4:1-4:42")],
      schemas: [
        {
          name: "S",
          fields: [
            fieldA(),
            { name: "f", wireName: null, typeSource: "{}" },
            { name: "g", wireName: null, typeSource: "integer" },
          ],
          by: null,
        },
      ],
      statementKinds: [...ONE_SCHEMA_KINDS],
      tailPresent: true,
    });
  });

  it("9i: CONTROL the same shape at the `let` annotation position ", () => {
    expect(
      observe(body("let x: {a: string, 42: integer} = 1")),
      "9i — the inline half at a second position, proving the anchor and subject there are the " +
        "inline row's and not this route's",
    ).toEqual({
      diagnostics: [inlineNotIdentifierLine("4:1-4:36", "42")],
      schemas: [],
      statementKinds: ["let", "let"],
      tailPresent: true,
    });
  });
});
