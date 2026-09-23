// A shared "diagnostic-load harness" for the `b02xx` bug-report test files that
// each parse a small `mode: prompt` fixture and assert on its diagnostics, its
// registration outcome, and its rendered registry messages.
//
// WHY THIS FILE EXISTS. Several `b02xx` files independently redeclared the same
// `LoadRow` shape, the same `parseDoc`-wrapping row builder, the same
// composition-root registration mirror, and the same registry-message renderer
// (PTQ-0206, PTQ-0207). This module centralises the parts that are byte-for-byte
// identical across those files; a per-file fixture path (the second argument to
// `loadRow` / `loadRowFromBody`) and a per-file registry array/path (the first
// two arguments to `registryMessageOf` / `registryLineOf`) are threaded through
// explicitly rather than assumed, so a file whose registry setup is its own
// (read scope, page set) is unaffected.
//
// TIER: unit, offline, deterministic, provider-free; the registry readers are
// also used by live cells. Nothing here is stubbed: `loadRow` parses
// through the real `parseDoc` (`tests/helpers/e2e-s1.ts`), itself a thin,
// inert-deps wrapper over the shipped `parseThetaDocument`.

import { readFileSync } from "node:fs";
import { repoFile } from "./corpus-reader";
import { expect } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../../src/diagnostics/diagnostic";
import type { FnDecl, FnParam, SchemaDecl, ThetaDocument } from "../../src/parser/theta-document";
import type { LowerCtx } from "../../src/parser/params";
import { at, topKinds, parseDoc, diagLines, errorLineAt, isLoadParseError } from "./e2e-s1";

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

/** A parsed row of the code registry, as `parseRegistry` yields it. */
export interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** A parsed row of `code-registry-parse.md`, with the four columns several `b02xx` files read. */
export interface ParseCodeRegistryRow extends RegistryRow {
  readonly severity: string;
  readonly phase: string;
}

/** The single-page diagnostics registry several `b02xx` load harnesses share. */
export const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

/** `code-registry-parse.md`, parsed once. */
export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
  readFileSync(repoFile(PARSE_REGISTRY_PATH), "utf8"),
) as ParseCodeRegistryRow[];

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a row whose *Message* moved reds by naming the registry page rather than by a
 * bare `undefined` comparison downstream. Live fragment readers can retain
 * replace-all substitution and their post-fill placeholder drift guard.
 */
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
  options: {
    /** Require a non-empty template before substituting placeholders. */
    readonly requireNonEmpty?: boolean;
    readonly replaceAll?: boolean;
    readonly unfilledPattern?: RegExp;
  } = {},
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeTypeOf("string");
  if (options.requireNonEmpty) {
    expect(
      typeof template === "string" && template.length > 0,
      `DIAG-4: the ${code} Message column must be a non-empty string; got ${JSON.stringify(template)}`,
    ).toBe(true);
  }
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = options.replaceAll
      ? out.replaceAll(placeholder, value)
      : out.replace(placeholder, value);
  }
  if (options.unfilledPattern !== undefined) {
    expect(
      out,
      `${code}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
    ).not.toMatch(options.unfilledPattern);
  }
  return out;
}

/** `PARSE_REGISTRY`'s *Message* template for `code` with placeholders filled (DIAG-4). */
export function parseMsg(
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  return registryMessageOf(PARSE_REGISTRY, PARSE_REGISTRY_PATH, code, fills);
}

// ===========================================================================
// The reserved-keyword-family range builders the bug 0153 / 0242 / 0249
// witness files share, rendered `severity code @l:c-l:c: message`.
// ===========================================================================

/** The code the `controlHeads` scan pushes on a body that is not a braced block. */
export const SINGLE_LINE_IF = "theta/parse/single-line-if";

/** The reserved-spelling refusal `reservedAt` fills and ranges. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";

/**
 * The reserved refusal ranged on the offending NAME itself: one-token names
 * are ASCII here, so the end column is `column + keyword.length` (1-indexed,
 * end-exclusive, per lexical.md §"Diagnostic spans").
 */
export function reservedAt(keyword: string, line: number, column: number): string {
  return errorLineAt(
    RESERVED,
    parseMsg(RESERVED, [["<keyword>", keyword]]),
    line,
    column,
    column + keyword.length,
  );
}

/** The `controlHeads` scan's verdict, ranged on the head token. */
export function singleLineIfAt(head: string, line: number, column: number): string {
  return errorLineAt(SINGLE_LINE_IF, parseMsg(SINGLE_LINE_IF, []), line, column, column + head.length);
}

/**
 * A registry row's normative *Message* template (DIAG-4), read rather than
 * restated. THROWS, naming the missing row, so a missing row can never degrade
 * an assertion below into a comparison against `undefined` and can never be
 * silently replaced by a hard-coded string. Call only from inside a test
 * body: at module scope a throw would abort collection and take the green
 * fences down with it. The caller supplies its bug-specific failure context.
 */
export function registryMessageOrThrow(
  registry: readonly RegistryRow[],
  code: string,
  missingRowContext: string,
): string {
  const template = registryMessage(registry, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. ${missingRowContext}`,
    );
  }
  return template;
}

/** One rendered diagnostic line, `<severity> <code>: <message>` — the bug documents' own rendering. */
export function registryLineOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  return `error ${code}: ${registryMessageOf(registry, registryPath, code, fills)}`;
}

/**
 * DIAG-2: the registry is closed, so a code a test asserts must have a row
 * (`reconcileClosedSet`, tools/code-registry/index.js). Assert each asserted
 * code carries a row of the expected severity and phase, failing loudly on a
 * missing row rather than letting a message render substitute into an absent
 * template.
 */
export function expectClosedSetRows(
  registry: readonly ParseCodeRegistryRow[],
  registryPath: string,
  expected: ReadonlyArray<readonly [code: string, severity: string, phase: string]>,
): void {
  const rows = expected.map(([code]) => {
    const r = registry.find((x) => x.code === code);
    return [code, r?.severity, r?.phase] as const;
  });
  expect(
    rows,
    `DIAG-2: ${registryPath} must carry a closed-set row for each asserted code`,
  ).toEqual(expected.map((t) => [...t]));
}

// ===========================================================================
// The load harness.
// ===========================================================================

/** An ordered diagnostic contract: codes and their rendered messages. */
export interface Expectation {
  readonly codes: readonly string[];
  readonly msgs: readonly string[];
}

/** The empty contract — no diagnostic at all. */
export const CLEAN: Expectation = { codes: [], msgs: [] };

/** A one-diagnostic contract. */
export function one(code: string, message: string): Expectation {
  return { codes: [code], msgs: [message] };
}

/** An ordered two-diagnostic contract. */
export function two(first: Expectation, second: Expectation): Expectation {
  return {
    codes: [...first.codes, ...second.codes],
    msgs: [...first.msgs, ...second.msgs],
  };
}

/** One site-precondition row: a fixture body, its expected sites and diagnostic contract. */
export interface SiteRow {
  readonly label: string;
  /** The fixture body; frontmatter is prepended by `expectSiteRow`. */
  readonly src: string;
  /** Overrides the driver's default frontmatter (e.g. a row that needs `params:`). */
  readonly frontmatter?: string;
  readonly sites: readonly string[];
  readonly expected: Expectation;
  /** Why the spec owes this verdict — quoted in the failure message. */
  readonly reason: string;
  /** Optional `severity code @range` list, pinning WHICH node carries a verdict. */
  readonly located?: readonly string[];
}

/** A suite's fixture path, default frontmatter, site producer and failure claims. */
export interface SiteRowDriver {
  readonly file: string;
  readonly frontmatter: string;
  /** The suite's site list for the parsed fixture (the precondition's actual value). */
  readonly sitesOf: (doc: ThetaDocument) => string[];
  /** What the precondition requires, quoted after `<label> PRECONDITION: `. */
  readonly sitesClaim: string;
  /** What the located list pins, quoted after `<label> — `. */
  readonly locatedClaim: string;
}

/**
 * One row: the site precondition, then the WHOLE ordered code list, then the
 * whole ordered message list, then (when supplied) the whole ordered located
 * form. Whole-list ordered equality throughout — a containment matcher would
 * let an over-correction's spurious extra emission hide. The precondition makes
 * a drifted or unparsed fixture fail before the assertions below measure nothing.
 */
export function expectSiteRow(row: SiteRow, driver: SiteRowDriver): ThetaDocument {
  const doc = parseDoc((row.frontmatter ?? driver.frontmatter) + row.src, driver.file);
  expect(
    driver.sitesOf(doc),
    `${row.label} PRECONDITION: ${driver.sitesClaim} Diagnostics: ${render(doc)}`,
  ).toEqual([...row.sites]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${row.label} — ${row.reason}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.codes]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.message),
    `${row.label} — DIAG-4 (diagnostic-shape.md:74): the rendered messages are the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.msgs]);
  const located = row.located;
  if (located !== undefined) {
    expect(
      doc.diagnostics.map((d: Diagnostic) => {
        const r = d.range;
        return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}`;
      }),
      `${row.label} — ${driver.locatedClaim} Diagnostics: ${render(doc)}`,
    ).toEqual([...located]);
  }
  return doc;
}

/** One diagnostic reduced to its structural triple — severity, code, span. */
interface Triple {
  readonly severity: string;
  readonly code: string;
  readonly at: string;
}

/** One diagnostic reduced to the full quadruple, message included. */
interface Quad extends Triple {
  readonly message: string;
}

/** Bind diagnostic projections and declaration readers to a suite's registry-message oracle. */
export function diagnosticHarness(
  msg: (code: string, fills: ReadonlyArray<readonly [string, string]>) => string,
) {
  /** The structural triples of every diagnostic, in report order. */
  function triples(doc: ThetaDocument): Triple[] {
    return doc.diagnostics.map((d: Diagnostic) => ({
      severity: d.severity,
      code: d.code,
      at: at(d.range),
    }));
  }

  /** An expected structural triple (severity is `error` for every row here). */
  function e(code: string, span: string): Triple {
    return { severity: "error", code, at: span };
  }

  /** The full quadruples of every diagnostic, in report order. */
  function quads(doc: ThetaDocument): Quad[] {
    return doc.diagnostics.map((d: Diagnostic) => ({
      severity: d.severity,
      code: d.code,
      at: at(d.range),
      message: d.message,
    }));
  }

  /** An expected quadruple whose message is read from the registry (DIAG-4). */
  function q(
    code: string,
    span: string,
    fills: ReadonlyArray<readonly [string, string]> = [],
  ): Quad {
    return { severity: "error", code, at: span, message: msg(code, fills) };
  }

  /** Every diagnostic rendered for a failure payload. */
  function render(doc: ThetaDocument): string {
    return JSON.stringify(quads(doc));
  }

  /**
   * The single `fn` declaration of `doc`. Presence and uniqueness are asserted
   * before the read, so a row whose declaration vanished reds by naming that
   * rather than by dereferencing `undefined`.
   */
  function fnOf(doc: ThetaDocument): FnDecl {
    const decls = doc.body.statements.filter((s) => s.kind === "fn") as FnDecl[];
    expect(
      decls.length,
      `exactly one \`fn\` declaration is expected; statements=${JSON.stringify(topKinds(doc))}`,
    ).toBe(1);
    const only = decls[0];
    if (only === undefined) {
      throw new Error(`no \`fn\` declaration to read; diagnostics=${render(doc)}`);
    }
    return only;
  }

  /** The recorded `{name, type}` parameter pairs of the single `fn`. */
  function paramsOf(doc: ThetaDocument): FnParam[] {
    return fnOf(doc).params.map((p) => ({ name: p.name, type: p.type }));
  }

  /** Error-severity-only registration mirror; namespace-scoped callers keep their own predicate. */
  function registered(doc: ThetaDocument): boolean {
    return !doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
  }

  return { triples, e, quads, q, render, fnOf, paramsOf, registered };
}

/** One parsed row: its codes, its rendered lines, and the declarations it captured. */
export interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}

/** The frontmatter several `b02xx` fixtures carry, per their bug documents' §Reproduction. */
export const LOAD_ROW_FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

function toLoadRow(label: string, doc: ThetaDocument): LoadRow {
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

/** Parse `source` verbatim through the shared `parseDoc`, wrapped as a `LoadRow`. */
export function loadRow(label: string, source: string, fixturePath: string): LoadRow {
  return toLoadRow(label, parseDoc(source, fixturePath));
}

/** A `mode: prompt` theta whose body is `body` verbatim (`LOAD_ROW_FRONTMATTER`-prefixed), parsed once. */
export function loadRowFromBody(label: string, body: string, fixturePath: string): LoadRow {
  return loadRow(label, `${LOAD_ROW_FRONTMATTER}${body}\n`, fixturePath);
}

/**
 * A one-field `params:` fixture: the type is on line 5 and the body includes a
 * binding so `expectCaptured` can observe a statement before reading diagnostics.
 */
export function loadRowFromParam(label: string, typeText: string, fixturePath: string): LoadRow {
  return loadRow(
    label,
    `---\ndescription: d\nmode: prompt\nparams:\n  p: '${typeText}'\n---\n\nlet z = 1\n"ok"\n`,
    fixturePath,
  );
}

/**
 * The composition root's registration gate, mirrored: `hasLoadParseError`
 * (`src/extension/production-composition.ts`) is
 * `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
 * d.code.startsWith("theta/parse/")))`, and a document carrying one is not
 * registered.
 */
export function registered(row: LoadRow): boolean {
  return !row.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

/** The 1-indexed `line:column` start of each diagnostic in a row. */
export function startPositions(row: LoadRow): string[] {
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
export function expectCaptured(rows: readonly LoadRow[], names: readonly string[]): void {
  const empty = rows.filter((r) => r.statements === 0).map((r) => r.label);
  expect(
    empty,
    "precondition: every fixture must parse to at least one body statement; a row listed here lost its body upstream of the type walk, so its diagnostic list says nothing about this bug",
  ).toEqual([]);
  expectDeclared(rows, names);
}

/** Assert the exact declaration names, retaining a caller's failure context. */
export function expectDeclared(
  rows: readonly LoadRow[],
  names: readonly string[],
  message = `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}`,
): void {
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(mismatched, message).toEqual([]);
}

/**
 * Assert the ordered code list, THEN the ordered rendered-message list. The
 * message side is a thunk so the registry read happens only after the code
 * assertion has passed: a missing emission must red as a missing diagnostic,
 * not as a registry lookup.
 */
export function expectRows(
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

/** One probed position: its fixture, the declarations it captures, and its emission range. */
export interface Position {
  readonly id: string;
  /** The fixture, in the shape bug 0281 §Reproduction spells it. */
  readonly build: (spelling: string) => LoadRow;
  /** The declarations the fixture captures, asserted before any disposition. */
  readonly decls: readonly string[];
  /**
   * The `line:column` this position emits at. Each is MEASURED, at this
   * position, over the same fixture shape carrying the BARE spelling of the
   * head under test — the reading an applied head converges on. The range is
   * therefore fixed by the position's existing sibling emission rather than
   * chosen here.
   */
  readonly at: string;
}

/** Bind the nine-position fixtures and matrix assertions to a caller's row builders. */
export function createTypePositionMatrix(
  theta: (label: string, body: string) => LoadRow,
  paramsTheta: (label: string, typeText: string) => LoadRow,
) {
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

  return { POSITIONS, cells, expectMatrix };
}

/** The three positions that thread the `LowerCtx.unspellable` refusal sink. */
export type SinkPosition = "field" | "alias" | "params";

/** The four annotation-side positions used by type-refusal probes. */
export type AnnotationPosition = "let" | "fnparam" | "fnret" | "query";

/** `Cat` for the rows whose text names it, so no unresolved-name diagnostic enters. */
const CAT_DECL = "schema Cat { a: string }\n";

/** The declaration each sink position refuses at — what `<X>` / `<param>` renders. */
export const TYPE_POSITION_DECL_NAME: Record<SinkPosition, string> = { field: "S", alias: "X", params: "f" };

/** The §Reproduction fixture for one position, with `T` substituted. */
function fixture(
  position: SinkPosition | AnnotationPosition,
  typeSource: string,
  withCat: boolean,
  paramsScalar: (typeSource: string) => string,
): string {
  const cat = withCat ? CAT_DECL : "";
  switch (position) {
    case "field":
      return `${cat}schema S {\n  f: ${typeSource}\n}\nlet x = 1\n`;
    case "alias":
      return `${cat}schema X = ${typeSource}\nlet x = 1\n`;
    case "params":
      return `---\nmode: prompt\nparams:\n  f: ${paramsScalar(typeSource)}\n---\n${cat}let x = 1\n`;
    case "let":
      return `${cat}let x: ${typeSource} = 1\n`;
    case "fnparam":
      return `${cat}fn f(p: ${typeSource}): integer { 1 }\nlet x = 1\n`;
    case "fnret":
      return `${cat}fn f(): ${typeSource} { 1 }\nlet x = 1\n`;
    case "query":
      return `${cat}let r = @<${typeSource}>\`hi\`\n`;
  }
}

/** What one fixture yields. */
export interface TypePositionRead {
  /** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
  readonly lines: readonly string[];
  /** Codes in the order requested by the reader (emission or distinct-sorted). */
  readonly codes: readonly string[];
  /** The count the shipped drop gate reads: error severity in the two namespaces. */
  readonly gateCount: number;
  /** Whether the load produced a frontmatter block at all. */
  readonly frontmatterPresent: boolean;
  /** The whole document, for the loud readers below. */
  readonly doc: ThetaDocument;
}

/** Bind type-position fixtures to their path, code ordering and YAML scalar spelling. */
export function makeTypePositionReader(options: {
  readonly path: string;
  readonly codeOrder: "emission" | "distinct-sorted";
  readonly paramsScalar?: (typeSource: string) => string;
}) {
  const paramsScalar = options.paramsScalar ?? ((typeSource: string) => `'${typeSource}'`);

  /**
   * Read one type text at one position through the shipped load path, loud on
   * every way a fixture can fail to reach the lowering: a fixture whose
   * declaration never parsed would assert a verdict for the wrong reason.
   */
  function read(
    label: string,
    position: SinkPosition | AnnotationPosition,
    typeSource: string,
    withCat = false,
  ): TypePositionRead {
    const src = fixture(position, typeSource, withCat, paramsScalar);
    const doc = parseDoc(src, options.path);
    if (position === "field" || position === "alias") {
      const wanted = TYPE_POSITION_DECL_NAME[position];
      const decl = doc.body.statements.find(
        (s): s is SchemaDecl => s.kind === "schema" && s.name === wanted,
      );
      if (decl === undefined) {
        throw new Error(
          `${label}: the fixture must declare \`schema ${wanted}\` for a type-position verdict to ` +
            `be attributable to it; statement kinds ` +
            `${JSON.stringify(doc.body.statements.map((s) => s.kind))}, diagnostics ` +
            `${JSON.stringify(diagLines(doc))}`,
        );
      }
    }
    return {
      lines: diagLines(doc),
      codes: options.codeOrder === "distinct-sorted"
        ? [...new Set(doc.diagnostics.map((d) => d.code))].sort()
        : doc.diagnostics.map((d) => d.code),
      gateCount: doc.diagnostics.filter(
        (d) =>
          d.severity === "error" &&
          (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
      ).length,
      frontmatterPresent: doc.frontmatter !== null && doc.frontmatter !== undefined,
      doc,
    };
  }

  return read;
}

/**
 * The lowered `params:` property for field `f`, loud when the load withheld the
 * frontmatter or the lowered document: comparing `undefined` against a fragment
 * would pass or fail for a reason that is not the cell's.
 */
export function loweredF(label: string, r: TypePositionRead): unknown {
  const document = r.doc.frontmatter?.params?.loweredSchema as
    | Record<string, unknown>
    | undefined;
  if (document === undefined) {
    throw new Error(
      `${label}: the fixture declares a \`params:\` block, so its lowered schema must be ` +
        `present for the field's fragment to be readable; frontmatter present: ` +
        `${r.frontmatterPresent}, diagnostics ${JSON.stringify(r.lines)}`,
    );
  }
  const properties = document["properties"] as Record<string, unknown> | undefined;
  if (properties === undefined || !("f" in properties)) {
    throw new Error(
      `${label}: the lowered \`params:\` document carries no property \`f\`, so the field never ` +
        `lowered; document ${JSON.stringify(document)}`,
    );
  }
  return properties["f"];
}

/** The `LowerCtx` the direct-seam cells thread: no declarations, one sink. */
export function seamCtx(): { readonly ctx: LowerCtx; readonly sink: string[] } {
  const sink: string[] = [];
  return {
    ctx: { bodyTypeMap: new Map(), defs: {}, unresolved: [], unspellable: sink },
    sink,
  };
}

/**
 * A diagnostic reduced to the five normative fields (diagnostic-shape.md
 * §"Internal diagnostic shape"). `hint` is excluded on purpose: it is a
 * non-normative repair aid carried in its own registry column, so pinning it
 * would make an added hint fail an assertion that is about the refusal.
 */
export interface DiagShape {
  readonly severity: string;
  readonly code: string;
  readonly file: string | undefined;
  readonly range: SourceRange | undefined;
  readonly message: string;
}

export function shapes(doc: ThetaDocument): DiagShape[] {
  return doc.diagnostics.map(diagnosticShape);
}

function diagnosticShape(d: Diagnostic): DiagShape {
  return {
    severity: d.severity,
    code: d.code,
    file: d.file,
    range: d.range,
    message: d.message,
  };
}

/**
 * The five normative diagnostic fields plus `hint`. `hint` is asserted because
 * route (a) reuses `checkIncrementDecrement` UNCHANGED, so the registered Hint
 * reaching the author is half of what this fix delivers — and its absence on
 * the two neighbouring codes is measured, not assumed.
 */
export interface DiagShapeWithHint extends DiagShape {
  readonly hint: string | undefined;
}

/** Include the repair hint where the test contract asserts it. */
export function shapesWithHint(doc: ThetaDocument): DiagShapeWithHint[] {
  return doc.diagnostics.map((d) => ({ ...diagnosticShape(d), hint: d.hint }));
}

/** A 1-indexed, end-exclusive-column source range literal. */
export function range(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): SourceRange {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}

/**
 * The PATTERN's span, from its source spelling alone: the object `PatternNode`
 * carries the whole pattern's range, head token through closing `}`.
 * Derived, not guessed: the caller states the
 * line, the start column and the pattern text, and the end column is
 * `start + text.length` because the range's end column is exclusive.
 */
export function patternRange(line: number, column: number, pattern: string): SourceRange {
  return range(line, column, line, column + pattern.length);
}

/**
 * Assert a document's WHOLE diagnostic list, order-sensitive and unfiltered.
 *
 * `assembleDiagnostics` (src/diagnostics/diagnostic.ts) orders by
 * (file, line, column) with a stable sort, so a multi-diagnostic row's expected
 * order is positional and measured, never guessed.
 */
export function expectDiagnosticsOf(
  doc: ThetaDocument,
  expected: readonly DiagShape[],
  why: string,
): ThetaDocument {
  expect(shapes(doc), `${why}\n  actual diagnostics: ${render(doc)}`).toEqual([...expected]);
  return doc;
}

/** Failure payload: every diagnostic rendered `severity code @l:c-l:c: message`. */
export function render(doc: ThetaDocument, includeHint = false): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      const at =
        r === undefined
          ? "-"
          : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
      const hint = includeHint ? ` [hint=${d.hint ?? "-"}]` : "";
      return `${d.severity} ${d.code} @${at}: ${d.message}${hint}`;
    }),
  );
}

/** Failure payload including each diagnostic's repair hint. */
export function renderWithHint(doc: ThetaDocument): string {
  return render(doc, true);
}

/** Whether the error-severity load/parse registration mirror refuses the list. */
export function deniesRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(isLoadParseError);
}
