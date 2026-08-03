import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lowerTypeSource } from "../src/parser/body-type-lowering";
import { lowerTypeExpr, type LowerCtx } from "../src/parser/params";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0044 — `theta/parse/unresolved-named-type` fires for reserved-keyword-
// shaped text, which is not a `NamedType`
// (docs/bugs/0044-unresolved-named-type-fires-for-keyword-shaped-text.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/diagnostics/code-registry-parse.md:90 —
//     `unresolved-named-type` triggers on "A `NamedType` that resolves to no
//     declaration usable at the position it is written". `NamedType ::= Ident`
//     (grammar.md:98) and lexical.md:20 bars all 32 reserved spellings from
//     identifier position — "keeping them reserved is what stops them matching
//     `NamedType ::= Ident`" — so keyword-shaped text is outside this trigger at
//     every position, and its `<name>` slot never renders a keyword.
//   - :21 — `theta/parse/reserved-keyword-as-identifier`, trigger "Reserved
//     keyword used in an identifier position", message
//     `reserved keyword '<keyword>' cannot be used as an identifier`. That is
//     the registered disposition for the class; no trigger edit is required.
//   - :59 — `void-in-non-return-position`, whose trigger already names "schema
//     or `params:` field" and "type ascription"; grammar.md:105 prescribes it
//     for every non-return `Type` position.
//   - :58 — `generic-arity-mismatch`, whose trigger ("a generic-type
//     application") is position-independent; :60 —
//     `result-in-schema-position`, whose trigger names "a schema field type, a
//     `params:` field type, or any type reachable transitively from those" and
//     does NOT name the `@<T>` annotation.
//   - grammar.md:102 — `LiteralType ::= STRING | NUMBER | BOOLEAN | NULL`, so
//     `true` / `false` are `Type` atoms in every `Type` position, including a
//     union arm (:94, :105).
//   - type-system.md:15 — one type grammar applies at every annotation
//     position, so the same source text reports the same codes at the alias
//     RHS, the schema-body field, the `params:` RHS and `@<T>`.
//   - DIAG-4 — the registry's *Message* column is normative. Every expected
//     string below is read out of the registry through `registryMessage`; no
//     message prose is copied.
//
// THE THREE PARTS OF §Fix THIS FILE PINS.
//
// (A) `lowerTypeExpr`'s atom section classifies a reserved spelling BEFORE the
//     `NamedType` resolution: `true` / `false` lower `{const: …}` silently;
//     `void` lowers `{}` and records nothing (its own registered row is the
//     rejection); the other 24 keywords lower `{}` and record on a SECOND sink
//     each of the four callers renders as `reserved-keyword-as-identifier`.
//     The five primitive spellings are still caught by `PRIMITIVE_TYPES` first,
//     and a real undeclared `NamedType` (`Nope`) is unchanged.
//
// (B) `void-in-non-return-position` is wired at the two positions that lack it,
//     through a `parseTypeExpression` call mirroring the two that exist.
//     - `params:` RHS → position `"schema-feeding"`: the registry rows at :59
//       and :60 both name "a `params:` field type" explicitly.
//     - `@<T>` annotation root → position `"value"`. WHY `"value"` AND NOT
//       `"schema-feeding"`: the `@<Schema>` annotation is a type ASCRIPTION
//       (query-forms.md:44, :57, cited by the bug doc's §Expected behaviour),
//       and `TypePosition`'s closed classification (type-grammar.ts:36–51) puts
//       "`invoke<T>` / type ascription" in `"value"`, where `void` is rejected
//       and `Result` is admitted; grammar.md §Type grammar states `Result`
//       "remains admitted in … `invoke<Type>` / type-ascription contexts", and
//       `result-in-schema-position`'s row (:60) does not name the annotation
//       position. `"schema-feeding"` there would widen a DIAG-2 trigger, which
//       §Fix Blast-radius forbids ("Registry. No new code and no *Message*
//       edit"). The consequence is asserted, not assumed, in group (g):
//       `generic-arity-mismatch` (position-independent) newly fires at BOTH new
//       positions, while `result-in-schema-position` newly fires at the
//       `params:` RHS and NOT at `@<T>`.
//
// (C) Drain order: at every caller the reserved-keyword sink drains BEFORE the
//     `unresolved` sink, and at the `params:` RHS the `parseTypeExpression`
//     diagnostics come before both, inside the same per-field loop — mirroring
//     the schema-field position, where `parseTypeExpression` precedes the name
//     walk. Every expectation below is an ordered whole-list equality, so the
//     order is asserted rather than sampled.
//
// WHY THE SECOND SINK IS NOT NAMED AT THE SEAM. §Fix specifies the sink's
// existence and its rendering, not its identifier, so this file names no new
// `LowerCtx` field. At the seam (group (e)) the assertions are the lowered
// BYTES plus `unresolved` — the sink whose over-firing IS the defect — and the
// keyword sink's contents are pinned at all four callers end-to-end through the
// rendered diagnostic, which is the DIAG-2 observable. For the boolean set both
// sinks are covered: `unresolved` is asserted empty at the seam AND the four
// end-to-end positions are asserted to emit nothing at all, which no second
// sink can survive.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string, one `lowerTypeSource` /
// `lowerTypeExpr` call, or one real AJV compile of a document those calls
// produce. An integration tier would add a session round-trip to a parse-time
// observable and could assert neither the ABSENCE of a diagnostic nor the byte
// shape of a lowered fragment; a live tier would additionally make the
// assertion stochastic. `parseDoc` (tests/helpers/e2e-s1.ts) is the shipped
// load path wrapped in the standard inert `parseDeps` double — the harness the
// bug doc's §Reproduction used.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. Every
// registry lookup asserts definedness before it is used, and every lowering
// read THROWS with the diagnostics rendered when an intermediate is absent, so
// a refused parse can never be mistaken for a pass.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/** The row this defect's emissions belong to. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
/** The row this defect's emissions escape. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
const VOID_POSITION = "theta/parse/void-in-non-return-position";
const ARITY = "theta/parse/generic-arity-mismatch";
const RESULT_POSITION = "theta/parse/result-in-schema-position";
/** Residue rows: the alias-arm stop set's readings, which must not move. */
const EMPTY_BODY = "theta/parse/empty-schema-body";
const LET_NO_INIT = "theta/parse/let-without-initialiser";
const UNSUPPORTED = "theta/parse/unsupported-feature";
const SINGLE_LINE_IF = "theta/parse/single-line-if";
const NON_BOOLEAN = "theta/parse/non-boolean-condition";
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";
const BREAK_OUTSIDE = "theta/parse/break-outside-loop";
const CONTINUE_OUTSIDE = "theta/parse/continue-outside-loop";
const BARE_RETURN = "theta/parse/bare-return-in-non-void";
const UNREACHABLE = "theta/parse/unreachable-code";
const MATCH_ARM_MISMATCH = "theta/parse/match-arm-type-mismatch";
/**
 * The residue row for `stopped("import", …)` / `stopped("export", …)`: the
 * alias-arm stop leaves a bare `import` / `export` residue — a specifier list
 * with no `from` clause — which bug 0058 §Fix refuses
 * (`docs/bugs/0058-fromless-export-form-parses-without-spec-production.md`).
 */
const MISSING_FROM_CLAUSE = "theta/parse/import-missing-from-clause";

/**
 * The reserved set read out of its normative source, `docs/spec_topics/lexical.md`
 * §Reserved keywords. The lexer's `reservedKeywords()` (src/lexer/lexer.ts:153)
 * is module-private, so the spec sentence is the oracle the matrix's
 * exhaustiveness claim is checked against; the extraction THROWS when its
 * anchor text is absent rather than degrading to a shorter list.
 */
function specReservedKeywords(): string[] {
  const page = readFileSync(
    fileURLToPath(new URL("../docs/spec_topics/lexical.md", import.meta.url)),
    "utf8",
  );
  const open = "**Reserved keywords.** Cannot be used as identifiers: ";
  const start = page.indexOf(open);
  if (start < 0) {
    throw new Error(
      `docs/spec_topics/lexical.md carries no \`${open}\` sentence, so the reserved set has no ` +
        "normative source to check the matrix against",
    );
  }
  const close = ". Using one of these in identifier position is";
  const end = page.indexOf(close, start);
  if (end < 0) {
    throw new Error(
      "docs/spec_topics/lexical.md §Reserved keywords no longer ends its list with " +
        `\`${close}\`, so the list's extent cannot be determined`,
    );
  }
  return [...page.slice(start + open.length, end).matchAll(/`([^`]+)`/g)].map(
    (match) => match[1] as string,
  );
}

/** Every code this file asserts, for the DIAG-4 coverage cell in group (d). */
const ASSERTED_CODES = [
  RESERVED,
  UNRESOLVED,
  VOID_POSITION,
  ARITY,
  RESULT_POSITION,
  EMPTY_BODY,
  LET_NO_INIT,
  UNSUPPORTED,
  SINGLE_LINE_IF,
  NON_BOOLEAN,
  NON_ARRAY_ITERAND,
  BREAK_OUTSIDE,
  CONTINUE_OUTSIDE,
  BARE_RETURN,
  UNREACHABLE,
  MATCH_ARM_MISMATCH,
  MISSING_FROM_CLAUSE,
] as const;

/**
 * The registry row's normative *Message* template with the named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so a
 * missing row or a reworded template reds by naming the registry rather than by
 * a silently-wrong expectation.
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
function line(code: string, message: string): string {
  return `error ${code}: ${message}`;
}

/** One rendered warning diagnostic (`unreachable-code` is the only W here). */
function warn(code: string, message: string): string {
  return `warning ${code}: ${message}`;
}

/** The registered rendering of a reserved keyword written where a `Type` is read. */
function kw(keyword: string): string {
  return line(RESERVED, msg(RESERVED, [["<keyword>", keyword]]));
}

/** The registered rendering of an unresolved `NamedType` — the row's real subject. */
function named(name: string): string {
  return line(UNRESOLVED, msg(UNRESOLVED, [["<name>", name]]));
}

/** The registered rendering of `void` outside a return type. */
function voidLine(): string {
  return line(VOID_POSITION, msg(VOID_POSITION, []));
}

// ===========================================================================
// Fixtures. One builder per registered position, each the bug doc's
// §Reproduction shape: a body fixture ends `let a = 1` + `a` so the file has a
// tail expression, and a `params:` fixture carries `mode: prompt` so no
// `theta/load/missing-mode` noise is present.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** Position 1 — the `schema X = …` alias/union right-hand side (bug 0033 §Fix). */
function aliasSrc(type: string): string {
  return `${FM}schema X = ${type}\n${TAIL}`;
}

/** Position 2 — a `schema` body field type (bug 0028 §Fix). */
function fieldSrc(type: string): string {
  return `${FM}schema X { f: ${type} }\n${TAIL}`;
}

/** Position 3 — the `params:` right-hand side (the walk's original site). */
function paramsSrc(type: string): string {
  return `---\nmode: prompt\nparams:\n  p: ${type}\n---\n${TAIL}`;
}

/** Position 4 — the `@<T>` query annotation, a type ascription (bug 0028 §Fix). */
function annotSrc(type: string): string {
  return `${FM}let r = @<${type}>\`hi\`\n${TAIL}`;
}

/** The four registered positions this defect reaches, in registry-row order. */
const POSITIONS = [
  { name: "alias RHS", build: aliasSrc },
  { name: "schema-body field", build: fieldSrc },
  { name: "`params:` RHS", build: paramsSrc },
  { name: "`@<T>` annotation", build: annotSrc },
] as const;

// ===========================================================================
// Parse + assertion helpers.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string): string[] {
  return diagLines(parseDoc(src, "bug0044.theta"));
}

/** The whole ordered diagnostic list of one source, asserted against `expected`. */
function expectList(src: string, expected: readonly string[], why: string): void {
  expect(
    lines(src),
    `${why}\nsource=${JSON.stringify(src)}`,
  ).toEqual([...expected]);
}

/** A `LowerCtx` over an EMPTY resolution set — no declaration resolves anything. */
function emptyCtx(): LowerCtx {
  // The fix adds a second sink to this frame. If it lands as a `LowerCtx`
  // field, thread it here — this is the file's single construction site.
  return { bodyTypeMap: new Map<string, Record<string, unknown>>(), defs: {}, unresolved: [] };
}

/** A real `AjvSchemaValidator` plus the diagnostics it emitted (V8c seam). */
function ajv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
  const emitted: Diagnostic[] = [];
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf }),
    emitted,
  };
}

/** A parsed, cleanly-lowered `params:` document. */
interface LoadedParams {
  readonly loweredSchema: LoweredSchema;
  readonly properties: Record<string, unknown>;
}

/**
 * Parse a `params:` fixture that must load, and read its lowered document back.
 * Every absent intermediate THROWS with the diagnostics rendered — a refused
 * parse must never read as a pass.
 */
function loadParams(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0044.theta");
  expect(
    diagLines(doc),
    `${label}: grammar.md:102 admits a \`LiteralType\` in every \`Type\` position, so this ` +
      `\`params:\` field must LOAD`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no ` +
        `AJV-validatable document. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const properties = lowered["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  return { loweredSchema: lowered, properties: properties as Record<string, unknown> };
}

// ===========================================================================
// (a) THE REACHABLE MATRIX — all 32 reserved keywords × the four registered
// positions, as ONE pinned table asserted whole-list per cell.
//
// The keyword list is the lexer's `reservedKeywords()` set
// (src/lexer/lexer.ts:153), which is module-private, so it is restated here in
// declaration order; group (d) asserts the count so a drift in the lexer's set
// reds rather than silently narrowing this table.
//
// The alias column is short because 0033's `ALIAS_ARM_STOP_KEYWORDS`
// (theta-document.ts) ends the right-hand-side capture on 15 of the spellings,
// so the residue statement's own codes are what that cell reports. Those
// `— (stopped)` cells are CONTROLS: §Non-goals keeps them, and this table's job
// is to prove they do not move.
// ===========================================================================

interface MatrixRow {
  readonly keyword: string;
  readonly alias: readonly string[];
  readonly field: readonly string[];
  readonly params: readonly string[];
  readonly annot: readonly string[];
}

/**
 * The table. Built inside a test body because every expected line is a registry
 * lookup that asserts its own row's presence first (DIAG-4).
 *
 * Three classes make up the four cells of each row:
 *   - a keyword the atom section must classify → `reserved-keyword-as-identifier`;
 *   - `void` → `void-in-non-return-position`, once, at every position;
 *   - a `LiteralType` (`true` / `false`) or a primitive spelling → silence.
 */
function matrix(): readonly MatrixRow[] {
  const kwOnly = (keyword: string): MatrixRow => ({
    keyword,
    alias: [kw(keyword)],
    field: [kw(keyword)],
    params: [kw(keyword)],
    annot: [kw(keyword)],
  });
  const silent = (keyword: string): MatrixRow => ({
    keyword,
    alias: [],
    field: [],
    params: [],
    annot: [],
  });
  /** A spelling the alias capture stops on: the residue's codes are the cell. */
  const stopped = (keyword: string, aliasResidue: readonly string[]): MatrixRow => ({
    keyword,
    alias: aliasResidue,
    field: [kw(keyword)],
    params: [kw(keyword)],
    annot: [kw(keyword)],
  });
  /**
   * A block-heading spelling: the residue is read as a single-line body at the
   * schema-body-field and `@<T>` positions too, where the keyword's own line
   * carries the following `{ … }`-less statement.
   */
  const stoppedBlock = (keyword: string, aliasResidue: readonly string[]): MatrixRow => ({
    keyword,
    alias: aliasResidue,
    field: [kw(keyword), line(SINGLE_LINE_IF, msg(SINGLE_LINE_IF, []))],
    params: [kw(keyword)],
    annot: [kw(keyword), line(SINGLE_LINE_IF, msg(SINGLE_LINE_IF, []))],
  });
  const emptyBody = (name: string): string =>
    line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", name]]));
  const headSwallowed = [emptyBody("X")];
  const singleLine = line(SINGLE_LINE_IF, msg(SINGLE_LINE_IF, []));
  // `import` / `export` residue only (bug 0058 §Fix): the swallowed head is
  // itself a specifier list with no `from` clause, which
  // `theta/parse/import-missing-from-clause` refuses. The reachable-matrix's
  // other `headSwallowed` residues (`invoke`, `Ok`, `Err`) are not
  // `import` / `export` statements, so the refusal does not reach them.
  const headSwallowedMissingFromClause = [
    ...headSwallowed,
    line(MISSING_FROM_CLAUSE, msg(MISSING_FROM_CLAUSE, [])),
  ];

  return [
    stopped("let", [
      emptyBody("X"),
      line(LET_NO_INIT, msg(LET_NO_INIT, [["<name>", "\n"]])),
    ]),
    kwOnly("mut"),
    stoppedBlock("fn", [
      emptyBody("X"),
      singleLine,
      line(
        UNSUPPORTED,
        msg(UNSUPPORTED, [["<construct>", "fn parameter list must be parenthesised"]]),
      ),
    ]),
    stoppedBlock("if", [
      emptyBody("X"),
      singleLine,
      line(NON_BOOLEAN, msg(NON_BOOLEAN, [["<type>", "null"]])),
    ]),
    kwOnly("else"),
    stoppedBlock("for", [
      emptyBody("X"),
      singleLine,
      line(NON_ARRAY_ITERAND, msg(NON_ARRAY_ITERAND, [["<type>", "null"]])),
    ]),
    kwOnly("in"),
    stoppedBlock("while", [
      emptyBody("X"),
      singleLine,
      line(NON_BOOLEAN, msg(NON_BOOLEAN, [["<type>", "null"]])),
    ]),
    stopped("break", [emptyBody("X"), line(BREAK_OUTSIDE, msg(BREAK_OUTSIDE, []))]),
    stopped("continue", [emptyBody("X"), line(CONTINUE_OUTSIDE, msg(CONTINUE_OUTSIDE, []))]),
    stopped("return", [
      emptyBody("X"),
      line(BARE_RETURN, msg(BARE_RETURN, [])),
      warn(UNREACHABLE, msg(UNREACHABLE, [])),
    ]),
    stopped("match", [
      emptyBody("X"),
      line(MATCH_ARM_MISMATCH, msg(MATCH_ARM_MISMATCH, [])),
    ]),
    stopped("schema", [emptyBody("X"), emptyBody("\n")]),
    kwOnly("enum"),
    // Bug 0058 §Fix: the alias capture empties the schema first, and the
    // swallowed `import` / `export` head is itself a specifier list with no
    // `from` clause, so the residue is BOTH codes — the empty schema and
    // `theta/parse/import-missing-from-clause`.
    stopped("import", headSwallowedMissingFromClause),
    stopped("export", headSwallowedMissingFromClause),
    kwOnly("from"),
    kwOnly("as"),
    kwOnly("by"),
    stopped("invoke", headSwallowed),
    silent("true"),
    silent("false"),
    silent("null"),
    stopped("Ok", headSwallowed),
    stopped("Err", headSwallowed),
    kwOnly("Result"),
    silent("string"),
    silent("number"),
    silent("integer"),
    silent("boolean"),
    kwOnly("array"),
    {
      keyword: "void",
      alias: [voidLine()],
      field: [voidLine()],
      params: [voidLine()],
      annot: [voidLine()],
    },
  ];
}

/** One position's column of the table, keyed by keyword, actual beside expected. */
function column(
  build: (type: string) => string,
  pick: (row: MatrixRow) => readonly string[],
): { readonly actual: Record<string, string[]>; readonly expected: Record<string, string[]> } {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const row of matrix()) {
    actual[row.keyword] = lines(build(row.keyword));
    expected[row.keyword] = [...pick(row)];
  }
  return { actual, expected };
}

/**
 * One type source at all four registered positions, actual beside expected, as
 * a single comparable table. A per-position loop of separate assertions stops
 * at the first divergence and hides the rest; type-system.md:15's claim is
 * about all four at once, so all four are compared at once.
 */
function acrossPositions(
  type: string,
  expectedLines: readonly string[],
): { readonly actual: Record<string, string[]>; readonly expected: Record<string, string[]> } {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const position of POSITIONS) {
    const key = `${type} @ ${position.name}`;
    actual[key] = lines(position.build(type));
    expected[key] = [...expectedLines];
  }
  return { actual, expected };
}

describe("bug 0044 (a) — the 32-keyword × four-position matrix", () => {
  it("a1: the alias right-hand side reports the keyword class, never an unresolved name", () => {
    // The nine spellings that reach the arm (`mut`, `else`, `in`, `enum`,
    // `from`, `as`, `by`, `Result`, `array`) plus `void`. The other 15 stop the
    // capture, and their residue codes are pinned unchanged.
    const { actual, expected } = column(aliasSrc, (row) => row.alias);
    expect(
      actual,
      "a1 — `schema X = <kw>`: lexical.md:20 bars every reserved spelling from `NamedType ::= " +
        "Ident`, so no cell may render `unresolved named type '<keyword>'`",
    ).toEqual(expected);
  });

  it("a2: the schema-body field type reports the keyword class, never an unresolved name", () => {
    // 25 of the 32 draw the row today; `void` draws it BESIDE its own correct
    // rejection, which is the double emission §Reproduction shape 1 names.
    const { actual, expected } = column(fieldSrc, (row) => row.field);
    expect(
      actual,
      "a2 — `schema X { f: <kw> }`: one type grammar per annotation position " +
        "(type-system.md:15), so this column and a1 agree wherever the alias capture reaches " +
        "the arm",
    ).toEqual(expected);
  });

  it("a3: the `params:` right-hand side reports the keyword class, never an unresolved name", () => {
    // The longest column: it is the only one of the four that does not route
    // through `lowerTypeSource`, so it loses the `parseLiteralArm` pre-check and
    // `true` / `false` join it. grammar.md:102 admits both.
    const { actual, expected } = column(paramsSrc, (row) => row.params);
    expect(
      actual,
      "a3 — `params: p: <kw>`: the two boolean `LiteralType` atoms load here exactly as they " +
        "do at the other three positions, and `void` draws its own registered row",
    ).toEqual(expected);
  });

  it("a4: the `@<T>` annotation reports the keyword class, never an unresolved name", () => {
    // The ascription position. `void` is rejected here through `TypePosition`
    // `"value"` (§Fix part B), not through the schema-feeding classification.
    const { actual, expected } = column(annotSrc, (row) => row.annot);
    expect(
      actual,
      "a4 — ``let r = @<<kw>>`hi` ``: query-forms.md:44 / :57 make the annotation an " +
        "ascription, and grammar.md:105 lists ascription contexts among the bare-`Type` positions",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (b) `void` — EXACTLY ONE diagnostic, at every position and every nesting.
// Two shapes collapse here: the double emission where the position's own row is
// wired (alias RHS, schema-body field), and the sole-wrong-emission where it is
// not (`params:` RHS, `@<T>`). §Fix's "No input goes from loud to silent" table
// makes both `void-in-non-return-position` alone.
// ===========================================================================

describe("bug 0044 (b) — `void` draws its registered row once and nothing else", () => {
  const shapes: ReadonlyArray<readonly [string, string]> = [
    ["bare", "void"],
    ["generic argument", "array<void>"],
    ["union arm", "void | string"],
  ];

  for (const [label, type] of shapes) {
    it(`b-${label.replace(/ /g, "-")}: \`${type}\` is exactly void-in-non-return-position at all four positions`, () => {
      // The registry row (:59) names the generic argument and the union arm
      // among its trigger positions explicitly; `walkType` fires once per
      // `void` node, and there is one node in each of these sources.
      const { actual, expected } = acrossPositions(type, [voidLine()]);
      expect(
        actual,
        `b (${label}) — code-registry-parse.md:59 is the whole rejection; ` +
          `\`unresolved named type 'void'\` claims the file fails to declare a type called ` +
          `\`void\`, which lexical.md:20 forbids declaring`,
      ).toEqual(expected);
    });
  }

  it("b-inline-annotation: `@<{ f: void }>` is exactly void-in-non-return-position", () => {
    // The inline-object annotation interior reaches the same walk (bug 0039's
    // `lowerInlineObject` dispatch), and `parseTypeExpression` descends an
    // object node's field types, so the ascription position rejects it here too.
    expectList(
      annotSrc("{ f: void }"),
      [voidLine()],
      "b-inline-annotation — an inline `ObjectType` is a `Type` (grammar.md §Inline object " +
        "types), so its field type answers to the same rule as a named schema's",
    );
  });

  it("b-inline-params: `params: p: { f: void }` is exactly void-in-non-return-position", () => {
    // The `params:` inline-object interior, bug 0035's surface, under §Fix
    // part B's `"schema-feeding"` wiring.
    expectList(
      paramsSrc("{ f: void }"),
      [voidLine()],
      "b-inline-params — code-registry-parse.md:59 names a `params:` field among its trigger " +
        "positions, and the rule reaches transitively into an inline object",
    );
  });
});

// ===========================================================================
// (c) MESSAGE PARITY — every expected code is read out of the registry (DIAG-4).
// ===========================================================================

describe("bug 0044 (c) — the registry is the message oracle", () => {
  it("c1: `reserved-keyword-as-identifier` renders the registry's Message with the keyword", () => {
    // The row already exists and already carries the `<keyword>` placeholder
    // (code-registry-parse.md:21), so §Fix adds no code and rewords no
    // *Message*: the emission is a trigger change under the GOV-15
    // diagnostic-registry carve-out, not a registry edit.
    const template = registryMessage(REGISTRY, RESERVED) as string | undefined;
    expect(
      template,
      "c1 — code-registry-parse.md:21 must carry the `reserved-keyword-as-identifier` row; " +
        "it is the registered disposition for a keyword in an identifier position, and " +
        "`NamedType ::= Ident` (grammar.md:98) is an identifier position",
    ).toBeDefined();
    expect(
      template,
      "c1 — the Message template must name the keyword, or the diagnostic cannot say WHICH " +
        "spelling was refused",
    ).toContain("<keyword>");
    expectList(
      fieldSrc("match"),
      [kw("match")],
      "c1 — the rendered emission is the registry's Message with `<keyword>` filled, never " +
        "copied prose",
    );
  });

  it("c2: every code this file asserts has a registry row", () => {
    // DIAG-2 closed-set honesty in the direction this file can check: an
    // expectation naming a code the registry does not carry is unfalsifiable.
    const missing = ASSERTED_CODES.filter(
      (code) => registryMessage(REGISTRY, code) === undefined,
    );
    expect(
      missing,
      "c2 — DIAG-2: the registry is the closed authority for what the implementation emits, " +
        "so every code asserted here must be a registered row",
    ).toEqual([]);
  });

  it("c3: the pinned matrix covers the whole reserved set, in spec order", () => {
    // The matrix's claim is exhaustiveness over the reserved set, so the set is
    // read out of lexical.md:20 rather than restated here on trust. A spelling
    // added to or removed from the spec reds this cell instead of silently
    // narrowing the table.
    const spec = specReservedKeywords();
    expect(
      matrix().map((row) => row.keyword),
      "c3 — lexical.md:20 §Reserved keywords is the normative set, and every one of its " +
        "spellings is barred from `NamedType ::= Ident` (grammar.md:98), so every one needs a row",
    ).toEqual(spec);
    expect(
      new Set(spec).size,
      "c3 — no spelling may appear twice, or a cell would be asserted against the wrong row",
    ).toBe(spec.length);
  });
});

// ===========================================================================
// (d) THE BOOLEAN `LiteralType` SET — the two grammar-admitted atoms the atom
// section refuses. `LiteralType ::= STRING | NUMBER | BOOLEAN | NULL`
// (grammar.md:102) admits them in every `Type` position, and `:94` / `:105`
// admit a union arm as a bare-`Type` position.
// ===========================================================================

describe("bug 0044 (d) — `true` and `false` are `Type` atoms wherever written", () => {
  const boolTypes = ["true", "false", "true | false", "true | string", "false | integer"];

  it("d1: every boolean-literal form loads clean at all four positions", () => {
    // The end-to-end half of "both sinks are silent": a second sink cannot
    // survive an empty diagnostic list.
    const table: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const type of boolTypes) {
      for (const position of POSITIONS) {
        const key = `${type} @ ${position.name}`;
        table[key] = lines(position.build(type));
        expected[key] = [];
      }
    }
    expect(
      table,
      "d1 — grammar.md:102 admits a `LiteralType` in every `Type` position and `:105` names " +
        "union arms a bare-`Type` position, so each of these carries no `E` diagnostic and the " +
        "file LOADS",
    ).toEqual(expected);
  });

  it("d2: `lowerTypeSource` lowers each boolean form to its literal fragment", () => {
    // The alias / field / `@<T>` route. The bare atom and the all-literal union
    // already go through `parseLiteralArm`; the MIXED union falls through to
    // `lowerTypeExpr`, whose arm recursion is the frame §Fix edits.
    const results: Record<string, unknown> = {};
    for (const type of [...boolTypes, "null"]) {
      const unresolved: string[] = [];
      const bytes = lowerTypeSource(
        type,
        new Map<string, Record<string, unknown>>(),
        {},
        unresolved,
      );
      results[type] = { bytes, unresolved };
    }
    expect(
      results,
      "d2 — §Fix Blast-radius: `true | string` lowers " +
        '{"anyOf":[{"const":true},{"type":"string"}]}, so the boolean arm reaches the lowered ' +
        "fragment instead of being replaced by the permissive `{}` that admits every instance",
    ).toEqual({
      true: { bytes: { const: true }, unresolved: [] },
      false: { bytes: { const: false }, unresolved: [] },
      "true | false": { bytes: { enum: [true, false] }, unresolved: [] },
      "true | string": {
        bytes: { anyOf: [{ const: true }, { type: "string" }] },
        unresolved: [],
      },
      "false | integer": {
        bytes: { anyOf: [{ const: false }, { type: "integer" }] },
        unresolved: [],
      },
      null: { bytes: { const: null }, unresolved: [] },
    });
  });

  it("d3: `lowerTypeExpr` lowers each boolean form to its literal fragment", () => {
    // The `params:` route, which reaches the atom section with no literal
    // pre-check at all. The union spellings follow from `lowerUnion`'s existing
    // arm classification, which §Fix does not touch: a `{const: …}` arm is not
    // a single-key `{type: <primitive>}`, so it stays non-primitive and the
    // union combines as `anyOf`.
    const results: Record<string, unknown> = {};
    for (const type of [...boolTypes, "null"]) {
      const ctx = emptyCtx();
      results[type] = { bytes: lowerTypeExpr(type, ctx), unresolved: ctx.unresolved };
    }
    expect(
      results,
      "d3 — §Fix part 1: `true` / `false` lower {const: true} / {const: false} with no " +
        "diagnostic, matching what `parseLiteralArm` already returns for the same atom at the " +
        "top level, so the `params:` RHS agrees with the bare-atom case that loads today",
    ).toEqual({
      true: { bytes: { const: true }, unresolved: [] },
      false: { bytes: { const: false }, unresolved: [] },
      "true | false": {
        bytes: { anyOf: [{ const: true }, { const: false }] },
        unresolved: [],
      },
      "true | string": {
        bytes: { anyOf: [{ const: true }, { type: "string" }] },
        unresolved: [],
      },
      "false | integer": {
        bytes: { anyOf: [{ const: false }, { type: "integer" }] },
        unresolved: [],
      },
      null: { bytes: { type: "null" }, unresolved: [] },
    });
  });

  it('CONTROL d4: real AJV over {"anyOf":[{"const":true},{"type":"string"}]}', () => {
    // The reference vector, compiled through the shipped `AjvSchemaValidator`
    // (V8c seam) independently of the parse. Green today: it states what the
    // fragment d5 must produce actually MEANS, so a red in d5 cannot be blamed
    // on AJV.
    const { validator, emitted } = ajv();
    const compiled = validator.compile({
      type: "object",
      properties: { p: { anyOf: [{ const: true }, { type: "string" }] } },
      required: ["p"],
      additionalProperties: false,
    });
    for (const accepted of [true, "x", ""]) {
      expect(
        compiled.validate({ p: accepted }).ok,
        `d4 — the union admits its two arms; rejected ${JSON.stringify(accepted)}`,
      ).toBe(true);
    }
    for (const rejected of [false, 1, null, [], {}]) {
      expect(
        compiled.validate({ p: rejected }).ok,
        `d4 — a value on NEITHER arm is refused; accepted ${JSON.stringify(rejected)}`,
      ).toBe(false);
    }
    expect(
      emitted.map((d) => d.code),
      "d4 — no slug-collision diagnostic: one compile of one document",
    ).toEqual([]);
  });

  it("d5: `params: p: true | string` loads and its lowered document constrains the argument", () => {
    // The consequence §Why it matters names: with the boolean arm replaced by
    // the permissive `{}` the envelope would accept every instance on one arm.
    // The fragment is AJV-enforced and is interpolated verbatim into the QRY-15
    // instruction text, so the bytes are a real observable, not an internal.
    const loaded = loadParams("d5", paramsSrc("true | string"));
    expect(
      loaded.properties["p"],
      "d5 — §Fix Blast-radius pins these bytes for this input class",
    ).toEqual({ anyOf: [{ const: true }, { type: "string" }] });
    const { validator, emitted } = ajv();
    const compiled = validator.compile(loaded.loweredSchema);
    for (const accepted of [true, "x"]) {
      expect(
        compiled.validate({ p: accepted }).ok,
        `d5 — the declared arms are admitted; rejected ${JSON.stringify(accepted)}`,
      ).toBe(true);
    }
    for (const rejected of [false, 1, null]) {
      expect(
        compiled.validate({ p: rejected }).ok,
        `d5 — with a permissive \`{}\` arm the envelope would accept ${JSON.stringify(rejected)}`,
      ).toBe(false);
    }
    expect(
      emitted.map((d) => d.code),
      "d5 — no slug-collision diagnostic: one compile of one document",
    ).toEqual([]);
  });

  it("d6: `params: p: true` loads and lowers to the single `const` fragment", () => {
    // The bare atom at the one position that never gets `parseLiteralArm`.
    // §Fix Blast-radius: "`params: p: true` becomes {"const":true} where the
    // field lowered nothing (the file was refused)".
    const loaded = loadParams("d6", paramsSrc("true"));
    expect(
      loaded.properties["p"],
      "d6 — the same atom the alias, field and annotation positions already lower this way",
    ).toEqual({ const: true });
    const { validator, emitted } = ajv();
    const compiled = validator.compile(loaded.loweredSchema);
    expect(compiled.validate({ p: true }).ok, "d6 — the one admitted value").toBe(true);
    expect(compiled.validate({ p: false }).ok, "d6 — `false` is not `true`").toBe(false);
    expect(compiled.validate({ p: "true" }).ok, "d6 — a string is not the boolean").toBe(false);
    expect(emitted.map((d) => d.code), "d6 — one compile of one document").toEqual([]);
  });
});

// ===========================================================================
// (e) THE SEAM — `lowerTypeSource` beside `lowerTypeExpr`, over an EMPTY
// resolution set, for the lowered bytes and the `unresolved` sink. Both routes
// answer the same for the same atom: keyword spellings leave `unresolved`
// EMPTY, and the row's real subject (`Nope`) is the only thing in it.
// ===========================================================================

describe("bug 0044 (e) — the two lowerers agree, and `unresolved` holds names only", () => {
  const atoms = ["match", "void", "array", "Result", "array<match>", "Nope", "array<integer>"];

  it("e1: `lowerTypeSource` records no keyword spelling on the `unresolved` sink", () => {
    // The permissive `{}` lowering is unchanged for every keyword class (§Fix:
    // "the fix changes which diagnostic names it, not the fragment"); what
    // moves is the sink the spelling lands on.
    const results: Record<string, unknown> = {};
    for (const atom of atoms) {
      const unresolved: string[] = [];
      const bytes = lowerTypeSource(
        atom,
        new Map<string, Record<string, unknown>>(),
        {},
        unresolved,
      );
      results[atom] = { bytes, unresolved };
    }
    expect(
      results,
      "e1 — `unresolved` feeds `unresolved-named-type`, whose trigger is a `NamedType` " +
        "(code-registry-parse.md:90). A keyword spelling is not one, so it must not appear here",
    ).toEqual({
      match: { bytes: {}, unresolved: [] },
      void: { bytes: {}, unresolved: [] },
      array: { bytes: {}, unresolved: [] },
      Result: { bytes: {}, unresolved: [] },
      "array<match>": { bytes: { type: "array", items: {} }, unresolved: [] },
      Nope: { bytes: {}, unresolved: ["Nope"] },
      "array<integer>": {
        bytes: { type: "array", items: { type: "integer" } },
        unresolved: [],
      },
    });
  });

  it("e2: `lowerTypeExpr` records no keyword spelling on the `unresolved` sink", () => {
    // The frame §Fix edits, called directly. `Nope` is the control that proves
    // the resolution arm is still entered by exactly the identifiers it was
    // meant for.
    const results: Record<string, unknown> = {};
    for (const atom of atoms) {
      const ctx = emptyCtx();
      results[atom] = { bytes: lowerTypeExpr(atom, ctx), unresolved: ctx.unresolved };
    }
    expect(
      results,
      "e2 — the atom section classifies a reserved spelling BEFORE the `NamedType` resolution, " +
        "so `lowerCtx.bodyTypeMap` is never consulted for one and the miss that follows can " +
        "never be reported as a resolution failure",
    ).toEqual({
      match: { bytes: {}, unresolved: [] },
      void: { bytes: {}, unresolved: [] },
      array: { bytes: {}, unresolved: [] },
      Result: { bytes: {}, unresolved: [] },
      "array<match>": { bytes: { type: "array", items: {} }, unresolved: [] },
      Nope: { bytes: {}, unresolved: ["Nope"] },
      "array<integer>": {
        bytes: { type: "array", items: { type: "integer" } },
        unresolved: [],
      },
    });
  });
});

// ===========================================================================
// (f) MULTIPLICITY. §Non-goals keeps the `params:`-site dedup asymmetry —
// `parseParams` iterates its sink without deduping where
// `collectUnresolvedNamedTypes` returns `[...new Set(...)]` — and §Fix routes
// the keyword sink the same way each caller routes the existing one, so the
// asymmetry is INHERITED by the new sink rather than fixed or worsened.
// Diagnostic-code sequence is GOV-15 observable (b), so each cell is ordered.
// ===========================================================================

describe("bug 0044 (f) — occurrence counts are inherited, not changed", () => {
  it("f1: `schema X { f: match | match }` emits the row ONCE", () => {
    // One walk per field, deduped by name inside it.
    expectList(
      fieldSrc("match | match"),
      [kw("match")],
      "f1 — `collectUnresolvedNamedTypes` dedups per type source, and the keyword sink drains " +
        "through the same caller",
    );
  });

  it("f2: `schema X { f: match, g: match }` emits the row TWICE", () => {
    // One walk per field, two fields.
    expectList(
      `${FM}schema X { f: match, g: match }\n${TAIL}`,
      [kw("match"), kw("match")],
      "f2 — the dedup is per type source, not per declaration",
    );
  });

  it("f3: `params: p: match | match` emits the row TWICE", () => {
    // The asymmetry §Non-goals keeps: the `params:` site has no dedup.
    expectList(
      paramsSrc("match | match"),
      [kw("match"), kw("match")],
      "f3 — §Non-goals: the `params:`-site dedup asymmetry is inherited unchanged for both " +
        "sinks; this cell pins it so a fix that silently normalises it is caught",
    );
  });

  it("f4: `params: p: true | false` is silent", () => {
    // Two `LiteralType` arms at the position that reports both today.
    expectList(
      paramsSrc("true | false"),
      [],
      "f4 — grammar.md:102 admits both atoms, so neither arm is a name and neither sink " +
        "receives anything",
    );
  });
});

// ===========================================================================
// (g) THE NEWLY-WIRED POSITIONS' COLLATERAL. §Fix part B adds one
// `parseTypeExpression` call at each of two positions, which brings that
// position's whole check set with it. The set is asserted explicitly so the
// non-widening decision for `@<T>` is pinned rather than assumed.
// ===========================================================================

describe("bug 0044 (g) — the two new `parseTypeExpression` calls, and only their registered rows", () => {
  it("g1: `params: p: Result<string, string>` fires result-in-schema-position", () => {
    // Registered for this position by name: code-registry-parse.md:60 reads
    // "a schema field type, a `params:` field type, or any type reachable
    // transitively from those".
    expectList(
      paramsSrc("Result<string, string>"),
      [line(RESULT_POSITION, msg(RESULT_POSITION, []))],
      "g1 — a `params:` field type is a lowered-schema position, so the `\"schema-feeding\"` " +
        "classification is the registered one",
    );
  });

  it("g2: `params: p: array<integer, string>` fires generic-arity-mismatch", () => {
    // Position-independent trigger (:58): `array` is arity 1 wherever written.
    expectList(
      paramsSrc("array<integer, string>"),
      [
        line(
          ARITY,
          msg(ARITY, [
            ["<ctor>", "array"],
            ["<expected>", "1"],
            ["<actual>", "2"],
          ]),
        ),
      ],
      "g2 — the closed `GenericType` arity check is position-independent, so wiring the " +
        "position brings it too",
    );
  });

  it("g3: `@<array<integer, string>>` fires generic-arity-mismatch", () => {
    // The same position-independent row at the ascription position.
    expectList(
      annotSrc("array<integer, string>"),
      [
        line(
          ARITY,
          msg(ARITY, [
            ["<ctor>", "array"],
            ["<expected>", "1"],
            ["<actual>", "2"],
          ]),
        ),
      ],
      "g3 — grammar.md §Type grammar's closed `GenericType` set does not vary by position",
    );
  });

  it("g4: `@<array<Result<string, string>>>` fires NOTHING", () => {
    // THE ASCRIPTION-POSITION GUARD. `@<Schema>` is an ascription
    // (query-forms.md:44, :57) and `TypePosition` puts an ascription in
    // `"value"`, where `Result` is admitted; grammar.md §Type grammar says
    // `Result` "remains admitted in … `invoke<Type>` / type-ascription
    // contexts", and `result-in-schema-position`'s row (:60) does not name the
    // annotation. Choosing `"schema-feeding"` here would be an unauthorised
    // DIAG-2 trigger widening — §Fix Blast-radius forbids registry changes.
    expectList(
      annotSrc("array<Result<string, string>>"),
      [],
      "g4 — wiring the annotation position must not import `result-in-schema-position` with " +
        "it; the whole list is asserted so an extra row cannot slip in unnoticed",
    );
  });

  it("g5: `@<Result<string, string>>` fires NOTHING", () => {
    // The un-nested spelling of g4, so the guard is pinned at the root as well
    // as inside a generic argument.
    expectList(
      annotSrc("Result<string, string>"),
      [],
      "g5 — the ascription root is a `\"value\"` position, and `Result` is admitted there",
    );
  });

  it("g6: `@<{ a: { b: match } }>` fires reserved-keyword-as-identifier", () => {
    // Bug 0039's residual-6 nested-walk surface, on this defect's mechanism:
    // `collectUnresolvedNamedTypes` dispatches a brace-rooted source to
    // `lowerInlineObject`, whose nested field type routes back through the
    // atom section.
    expectList(
      annotSrc("{ a: { b: match } }"),
      [kw("match")],
      "g6 — the nested interior answers to the same classification as the root, one type " +
        "grammar per position (type-system.md:15)",
    );
  });
});

// ===========================================================================
// (i) EMISSION ORDER. §Fix requires the keyword sink to drain with the "same
// range, same severity and same emission order as the `unresolved` sink each
// caller already drains", which leaves the ORDER BETWEEN THE TWO SINKS open;
// it is settled as keyword-sink-first, and at the `params:` RHS the
// `parseTypeExpression` diagnostics come ahead of both, inside the same
// per-field loop — mirroring the schema-field position, where
// `parseTypeExpression` already precedes the name walk. Diagnostic-code
// SEQUENCE is GOV-15 observable (b), so the decision is pinned on inputs that
// can falsify it: each fixture below writes the real `NamedType` FIRST, so a
// source-order drain and a sink-order drain give different answers.
//
// The alias RHS is absent from the two-sink cells because `schema X = Nope |
// match` stops at the `match` boundary under bug 0042's same-line-residue rule
// (`malformed-alias-rhs`), which owns that arrangement; `mut` is the spelling
// that reaches the arm, so i1 uses it there.
// ===========================================================================

describe("bug 0044 (i) — the keyword sink drains first, behind the type-grammar checks", () => {
  const twoSinks = [kw("mut"), named("Nope")];

  it("i1: `schema X = Nope | mut` reports the keyword before the name", () => {
    expectList(
      aliasSrc("Nope | mut"),
      twoSinks,
      "i1 — the two sinks are separate arrays drained in a fixed order, so the sequence is a " +
        "property of the caller rather than of where each atom sits in the source",
    );
  });

  it("i2: `schema X { f: Nope | mut }` reports the keyword before the name", () => {
    expectList(
      fieldSrc("Nope | mut"),
      twoSinks,
      "i2 — one type grammar per annotation position (type-system.md:15) extends to the " +
        "sequence the position emits",
    );
  });

  it("i3: `params: p: Nope | mut` reports the keyword before the name", () => {
    expectList(
      paramsSrc("Nope | mut"),
      twoSinks,
      "i3 — the `params:` site drains both sinks inside its per-field loop, in the same order " +
        "as the walk-driven callers",
    );
  });

  it("i4: `@<Nope | mut>` reports the keyword before the name", () => {
    expectList(
      annotSrc("Nope | mut"),
      twoSinks,
      "i4 — the ascription position takes the same sink order as the other three",
    );
  });

  it("CONTROL i5: `schema X { f: array<match, integer> }` puts the arity row first", () => {
    // The precedent the two newly-wired positions mirror: at the schema-body
    // field, `parseTypeExpression` already runs ahead of the name walk, so its
    // rows lead. Green on the ORDER today, red on the second line's code.
    expectList(
      fieldSrc("array<match, integer>"),
      [
        line(
          ARITY,
          msg(ARITY, [
            ["<ctor>", "array"],
            ["<expected>", "1"],
            ["<actual>", "2"],
          ]),
        ),
        kw("match"),
      ],
      "i5 — the type-grammar checks lead at the position that already wires them",
    );
  });

  it("i6: the two newly-wired positions put the arity row first as well", () => {
    const expected = [
      line(
        ARITY,
        msg(ARITY, [
          ["<ctor>", "array"],
          ["<expected>", "1"],
          ["<actual>", "2"],
        ]),
      ),
      kw("match"),
    ];
    expectList(
      paramsSrc("array<match, integer>"),
      expected,
      "i6 (`params:`) — the new `parseTypeExpression` call sits ahead of both sinks in the same " +
        "per-field loop",
    );
    expectList(
      annotSrc("array<match, integer>"),
      expected,
      "i6 (`@<T>`) — the same relative order at the ascription position",
    );
  });

  it("i7: `void | Nope` is the registered `void` row followed by the name, at every position", () => {
    // `void` records on NEITHER sink (§Fix part 2), so the only thing between
    // its own row and the real name is nothing at all.
    const { actual, expected } = acrossPositions("void | Nope", [voidLine(), named("Nope")]);
    expect(
      actual,
      "i7 — the position's own registered rejection leads and the genuine unresolved name " +
        "follows; no third line names `void`",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (h) NO-OP CELLS. Every surface §Fix leaves alone, asserted so "untouched" is
// a claim this file can falsify.
// ===========================================================================

describe("bug 0044 (h) — the untouched surfaces stay untouched", () => {
  it("h1: the five primitive spellings are silent at all four positions", () => {
    // `PRIMITIVE_TYPES` is tested before the atom section's identifier arm, so
    // these never reach the frame §Fix edits.
    const table: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const primitive of ["string", "number", "integer", "boolean", "null"]) {
      for (const position of POSITIONS) {
        const key = `${primitive} @ ${position.name}`;
        table[key] = lines(position.build(primitive));
        expected[key] = [];
      }
    }
    expect(
      table,
      "h1 — grammar.md:97 `PrimitiveType`: these five spellings are reserved AND legal type " +
        "atoms, and the fix must not disturb the arm that already catches them",
    ).toEqual(expected);
  });

  it("h2: `array<integer>` is silent at all four positions", () => {
    // `array` reaches the atom section only written bare; applied, it takes the
    // generic arm.
    const { actual, expected } = acrossPositions("array<integer>", []);
    expect(
      actual,
      "h2 — a well-formed generic application is untouched, and the two newly-wired positions " +
        "must not acquire a diagnostic for it",
    ).toEqual(expected);
  });

  it("h3: `Result<string, string>` is result-in-schema-position alone at the alias and field positions", () => {
    // The two positions where the type-grammar walk is already wired. The row
    // fires from the generic arm, not the atom section, so §Fix does not reach
    // it — and no `unresolved-named-type` may accompany it.
    const expected = [line(RESULT_POSITION, msg(RESULT_POSITION, []))];
    expectList(
      aliasSrc("Result<string, string>"),
      expected,
      "h3 (alias) — bug 0033 §Fix cell n9's contract, unchanged",
    );
    expectList(
      fieldSrc("Result<string, string>"),
      expected,
      "h3 (field) — the object-field control over the same type source",
    );
  });

  it("h4: `Nope` is unresolved-named-type at all four positions", () => {
    // The row's real subject. §Fix Blast-radius: "The resolution arm is entered
    // by exactly the identifiers it was meant for".
    const { actual, expected } = acrossPositions("Nope", [named("Nope")]);
    expect(
      actual,
      "h4 — a genuine undeclared `NamedType` keeps the row whose trigger it satisfies " +
        "(code-registry-parse.md:90)",
    ).toEqual(expected);
  });

  it("h5: `let a: match = 1` and `fn f(p: match): integer { 1 }` stay silent", () => {
    // §Non-goals: positions OUTSIDE the row. 0028 §Fix's negative boundary
    // ("`let x: Nope = 1`, `fn f(a: Nope)`, a union arm and `invoke<Nope>` all
    // stay silent") was reached for named types; nothing here revisits it for
    // keywords, so neither sink may acquire these positions.
    expectList(
      `${FM}let a: match = 1\na\n`,
      [],
      "h5 — a `let` annotation is not one of the row's five positions, and the fix adds no " +
        "position to either sink",
    );
    expectList(
      `${FM}fn f(p: match): integer { 1 }\n${TAIL}`,
      [],
      "h5 — a `fn` parameter type is likewise outside the row",
    );
  });
});
