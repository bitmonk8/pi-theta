// Shared drivers for the S1 (language-core) e2e coverage tests.
//
// These wrap the REAL production front-end entry points — `lexTheta`
// (src/lexer/lexer.ts) and `parseThetaDocument` (src/parser/theta-document.ts) —
// with inert, in-band recording seams so a test can assert on the returned
// diagnostics / tokens without a model or session. The frontmatter-only
// helpers share the same resolving matcher and diagnostic finder. No behaviour is stubbed:
// the code paths under assertion are the shipped ones.
import {
  resolveCallableSet,
  type CallableSetDeps,
  type CallableSetResult,
  type ResolvedPiTool,
  type ResolvedThetaCallee,
  type ToolsField,
} from "../../src/parser/callable-set";
import { type SourceRange } from "../../src/diagnostics/diagnostic";
import { type BypassParamsField } from "../../src/binder/binder-envelope";
import { expect } from "vitest";
import { lexTheta, type LexResult, type ThetaSource } from "../../src/lexer/lexer";
import {
  parseThetaDocument,
  type Block,
  type Expr,
  type Stmt,
  type FnDecl,
  type LetStmt,
  type QueryExpr,
  type ThetaDocument,
  type ThetaBody,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type EnumDecl,
} from "../../src/parser/theta-document";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type {
  SystemNoteDetails,
  SystemNoteChannelDeps,
  SystemNoteSender,
} from "../../src/extension/system-note-channel";
import {
  parseFrontmatter,
  type FrontmatterParseResult,
  type ModelReferenceMatcher,
} from "../../src/parser/frontmatter";
import type { LowerCtx } from "../../src/parser/params";
import { StaticTypeInferencePass } from "../../src/parser/static-type-inference";
import { checkCompatible, displayType, type Compatibility, type TypeEnv } from "../../src/parser/type-compat";
import type { LoweredSchema } from "../../src/seams/schema-validator";
import { lowerQueryResponseSchema } from "../../src/runtime/query-schema-lowering";

/** An in-band, no-op system-note channel that discards emitted batches. */
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

/** A trivially-resolving `model:` matcher (the model hook is not under test). */
const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};

/** Parse a full `.theta` source under the given (default resolving) matcher. */
export function parseFrontmatterSource(
  source: string,
  matcher: ModelReferenceMatcher = resolvingMatcher,
): FrontmatterParseResult {
  return parseFrontmatter(source, { file: "test.theta", modelMatcher: matcher });
}

/** Build a `.theta` source from frontmatter lines plus a trivial body. */
export function theta(...frontmatterLines: string[]): string {
  return ["---", ...frontmatterLines, "---", "@`hello`"].join("\n");
}

/** Parse frontmatter lines with a trivial body under the resolving matcher. */
export function parseFrontmatterLines(...frontmatterLines: string[]): FrontmatterParseResult {
  return parseFrontmatterSource(theta(...frontmatterLines));
}

/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}

/**
 * A theta-side literal carries theta-side quotes, so a `params:` entry wraps the
 * whole type expression in a YAML single-quoted scalar. The unquoted spelling
 * is not valid YAML and collapses the load to `theta/load/malformed-frontmatter-yaml`
 * (bug 0056 §Reproduction *Spelling*; bug 0263 names the code this collapse now
 * reports), which is a different frame.
 */
export function yamlQuoted(typeSource: string): string {
  return `'${typeSource.replace(/'/g, "''")}'`;
}

/** Parse a UTF-8 `.theta` source string through the whole-document pipeline. */
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

/** Parse a body while requiring valid frontmatter, retaining body diagnostics. */
export function parseBodyWithFrontmatter(
  body: string,
  path: string,
  frontmatter: string = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n"),
): ThetaDocument {
  const doc = parseDoc(`${frontmatter}\n${body}`, path);
  // A frontmatter parse failure means the body is never reached — an unmet
  // precondition, not the symptom under test. Fail loudly naming it.
  expect(
    doc.frontmatter,
    `frontmatter must parse or the body is never reached; parse diagnostics: ${JSON.stringify(
      diagLines(doc),
    )}`,
  ).not.toBeNull();
  return doc;
}

/** Frontmatter for every `.theta` row — occupies lines 1–3, body starts at 4. */
export const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];
const FM = `${FRONTMATTER.join("\n")}\n`;

/** Parse `body` as a `.theta` under the standard frontmatter. */
export function parsePromptBody(body: string, path = "test.theta"): ThetaDocument {
  return parseDoc(FM + body, path);
}

// Fixtures for Type positions. Every body fixture ends `let a = 1` + `a`
// so the theta carries a tail expression; every `params:` fixture carries
// `mode: prompt` so no `theta/load/missing-mode` noise is present.
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by the tail. */
export function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** A `mode: prompt` theta whose `params:` block is `block`. */
export function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — a type-ascription context (grammar.md:105). */
export function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

/** Read `QueryExpr.schema` off the parsed annotation fixture, asserting its AST shape. */
export function capturedQuerySchema(type: string, path: string): string {
  const src = annotSrc(type);
  const doc = parseDoc(src, path);
  const stmt = doc.body.statements[0];
  expect(
    stmt?.kind,
    `the @<T> fixture's first statement must be the \`let r = @<T>\` binding; source=${JSON.stringify(src)}`,
  ).toBe("let");
  const init = (stmt as LetStmt).init;
  expect(init?.kind, "that binding's initialiser must be the query expression").toBe("query");
  const schema = (init as QueryExpr).schema;
  expect(typeof schema, "the query expression must carry its `@<T>` annotation text").toBe("string");
  return schema as string;
}

/** The `invoke<T>` return annotation. */
export function invokeSrc(type: string): string {
  return body(`let r = invoke<${type}>("./x.theta")`);
}

/** A `LowerCtx` over an EMPTY resolution set — no declaration resolves anything. */
export function emptyCtx(): LowerCtx {
  return { bodyTypeMap: new Map<string, Record<string, unknown>>(), defs: {}, unresolved: [] };
}

/** The diagnostics the production parse reports for `body`, in emission order. */
export function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics;
}

/** The aggregated diagnostic codes, in emission order. */
export function bodyCodesOf(body: readonly string[]): string[] {
  return diagsOf(body).map((d: Diagnostic) => d.code);
}

/**
 * The message reported for `code`, or `undefined` when no diagnostic carries it.
 * Selecting by code rather than by position keeps a message failure attributable
 * to its own row even where the code list is also wrong.
 */
export function diagnosticMessageFor(diags: readonly Diagnostic[], code: string): string | undefined {
  return findCode(diags, code)?.message;
}

/** `(code, message)` pairs in emission order — the whole list, unfiltered. */
export function rowsOf(body: readonly string[]): Array<readonly [string, string]> {
  return diagsOf(body).map((d) => [d.code, d.message] as const);
}

/** An UNANNOTATED `fn` parameter read inside an `array<…>`, plus a call. */
export function fnParamCarrier(body: readonly string[]): readonly string[] {
  return ["fn f(p) {", ...body, "}", "let z = f(1)", "1"];
}

/** The aggregated diagnostic codes, in report order. */
export function documentCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => d.code);
}

/** `l:c-l:c`, 1-indexed, end-column exclusive; `-` for an unlocated diagnostic. */
export function at(r: SourceRange | undefined): string {
  return r === undefined
    ? "-"
    : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** Every diagnostic rendered `severity code @l:c-l:c: message` — failure payload. */
export function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}: ${d.message}`;
    }),
  );
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

/** The message reported for `code`, or `undefined` when no diagnostic carries it. */
export function messageFor(doc: ThetaDocument, code: string): string | undefined {
  return doc.diagnostics.find((d: Diagnostic) => d.code === code)?.message;
}

/**
 * The range of the single diagnostic carrying `code`. Uniqueness and
 * locatedness are asserted before the read, so an absent, duplicated, or
 * location-less diagnostic reds by naming the row rather than by comparing
 * against `undefined`.
 */
export function soleRange(doc: ThetaDocument, code: string): SourceRange {
  const hits = doc.diagnostics.filter((d: Diagnostic) => d.code === code);
  expect(
    hits.length,
    `exactly one ${code} is expected before its range is read; diagnostics=${render(doc)}`,
  ).toBe(1);
  const only = hits[0];
  if (only === undefined) {
    throw new Error(`no ${code} diagnostic to range; diagnostics=${render(doc)}`);
  }
  const r = only.range;
  if (r === undefined) {
    throw new Error(
      `the ${code} diagnostic must be located on the offending token; diagnostics=${render(doc)}`,
    );
  }
  return r;
}

/** Parse `src` and return its body (including bodies with load diagnostics). */
export function bodyOf(src: string): ThetaBody {
  return parseDoc(src).body;
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. The caller's
 * fixture must be parse-clean; rejection is a harness precondition breach,
 * never a silent skip.
 */
export function parseTheta(path: string, src: string): ThetaDocument {
  const doc = parseDoc(src, path);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

/** Diagnostic codes from a production parse, in emission order with duplicates retained. */
export function codesOf(src: string, path = "test.theta"): string[] {
  return parseDoc(src, path).diagnostics.map((d: Diagnostic) => d.code);
}

/** Parse a source given as raw bytes (for encoding-intake tests). */
export function parseDocBytes(bytes: Uint8Array, path = "test.theta"): ThetaDocument {
  return parseThetaDocument({ path, bytes }, parseDeps());
}

/** Lex a UTF-8 `.theta` source string through the shipped lexer. */
export function lexSrc(src: string, path = "test.theta"): LexResult {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return lexTheta(source, inertSystemNote());
}

/** Lex a source given as raw bytes (for encoding-intake tests). */
export function lexBytes(bytes: Uint8Array, path = "test.theta"): LexResult {
  return lexTheta({ path, bytes }, inertSystemNote());
}

/** True iff any diagnostic carries the given code. */
export function hasCode(diags: readonly Diagnostic[], code: string): boolean {
  return diags.some((d) => d.code === code);
}

/** The first diagnostic carrying the given code, if any. */
export function findCode(
  diags: readonly Diagnostic[],
  code: string,
): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** Diagnostics matching a registry code. */
export function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

/** All distinct diagnostic codes present (sorted, for readable failures). */
export function codes(diags: readonly Diagnostic[]): string[] {
  return [...new Set(diags.map((d) => d.code))].sort();
}

/** Error-severity diagnostics only. */
export function errors(diags: readonly Diagnostic[]): Diagnostic[] {
  return diags.filter((d) => d.severity === "error");
}

/** The error-severity load/parse codes `parseDoc` attributes to one source, sorted. */
export function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  return errors(parseDoc(thetaText, thetaPath).diagnostics).map((d) => d.code).sort();
}

/**
 * True iff `d` is the error-severity `theta/load/*` or `theta/parse/*` refusal
 * that blocks registration (mirrors `hasLoadParseError`,
 * src/extension/production-composition.ts).
 */
export function isLoadParseError(d: Diagnostic): boolean {
  return (
    d.severity === "error" &&
    (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))
  );
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Render one source's parse diagnostics as `severity code: message` strings. */
export function diagnosticsOf(text: string, path: string): readonly string[] {
  return diagLines(parseDoc(text, path));
}

/** Bind whole-list diagnostic assertions to a suite's default fixture path. */
export function diagnosticListHarness(defaultPath: string) {
  function lines(src: string, path = defaultPath): string[] {
    return diagLines(parseDoc(src, path));
  }

  /**
   * The whole ordered diagnostic list of one source, asserted against `expected`.
   * A whole-list equality is what makes both directions reachable: an absent
   * emission and an extra one both red, and multiplicity claims are only
   * meaningful against a whole list.
   */
  function expectList(src: string, expected: readonly string[], why: string): void {
    expect(lines(src), `${why}\nsource=${JSON.stringify(src)}`).toEqual([...expected]);
  }

  return { lines, expectList };
}

/** One diagnostic-list cell, with an optional fixture path for its driver. */
export interface DiagnosticCell<Exp> {
  readonly cell: string;
  readonly src: string;
  readonly path?: string | undefined;
  readonly expected: readonly Exp[];
}

/**
 * One group's cells asserted as a whole-map equality: separate assertions would
 * stop at the first divergence and hide the rest, and the subject-versus-control
 * agreement claims are only meaningful against whole lists compared together.
 */
export function expectGroup<Exp>(
  cells: readonly DiagnosticCell<Exp>[],
  why: string,
  lines: (cell: DiagnosticCell<Exp>) => string[],
  renderAll: (exps: readonly Exp[]) => string[],
  keyOf: (cell: DiagnosticCell<Exp>) => string = (c) => `${c.cell} :: ${c.src}`,
): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const c of cells) {
    const key = keyOf(c);
    actual[key] = lines(c);
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}

/** Diagnostics carrying `code`, in emission order, from a document or diagnostic list. */
export function withCode(source: ThetaDocument | readonly Diagnostic[], code: string): Diagnostic[] {
  const diags = "diagnostics" in source ? source.diagnostics : source;
  return diags.filter((d) => d.code === code);
}

/** Every diagnostic rendered `<severity> <code>`, in emission order. */
export function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** `code: message` render of the document's diagnostics, for diff-friendly emptiness assertions. */
export function diagnosticLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.code}: ${d.message}`);
}

/**
 * A block's trailing expression under the parser's dual encoding: the
 * promoted `tail`, or the final `ExprStmt`'s expression. The two encodings
 * are runtime-equivalent by design (src/runtime/statement-executor.ts — "the
 * executor's final value [is] invariant to the tail-vs-`expr`-statement
 * encoding"), and a fn-body trailing expression lands as an `ExprStmt` (the
 * block-internal `stmt-sep` is swallowed, so tail promotion's `lineStart`
 * never fires). Asserting through this helper keeps statement-boundary tests
 * pinned to a standalone trailing expression without over-pinning which
 * encoding the parser picks.
 */
export function trailingExpr(block: Block): Expr | null {
  if (block.tail !== null) {
    return block.tail;
  }
  const last = block.statements[block.statements.length - 1];
  return last !== undefined && last.kind === "expr" ? last.expr : null;
}

/** The single `FnDecl` of the parsed document. */
export function onlyFn(doc: ThetaDocument): FnDecl {
  const fn = doc.body.statements.find((s): s is FnDecl => s.kind === "fn");
  expect(fn, "the fn declaration parses into the body").toBeDefined();
  return fn as FnDecl;
}

/** The `let` statements of a block, in order. */
export function letsOf(block: Block): LetStmt[] {
  return block.statements.filter((s): s is LetStmt => s.kind === "let");
}

/** The sole top-level `let` statement bound to `name`, if the body declares one. */
export function findLetStmt(doc: ThetaDocument, name: string): LetStmt | undefined {
  return doc.body.statements.find(
    (s): s is LetStmt => s.kind === "let" && (s as LetStmt).name === name,
  );
}

/** The sole top-level `fn` declaration named `name`, if the body declares one. */
export function findFnDecl(doc: ThetaDocument, name: string): FnDecl | undefined {
  return doc.body.statements.find(
    (s): s is FnDecl => s.kind === "fn" && (s as FnDecl).name === name,
  );
}

/** Frontmatter for every `.theta` body row — occupies lines 1–3, body starts at 4. */
const SUBAGENT_FM = "---\nmode: subagent\n---\n";

/** A `mode: subagent` theta whose body is `stmt`, defaulting to a minimal registration control. */
export function subagentTheta(stmt: string = "@`Reply with a short one-line greeting.`"): string {
  return `${SUBAGENT_FM}${stmt}\n`;
}

/** A `mode: subagent` theta whose `params:` block is `block` (the key on line 4). */
export function subagentParamsSrc(block: string): string {
  return `---\nmode: subagent\nparams:\n${block}\n---\n1\n`;
}

/** One theta file: `---` fences over `<frontmatter>`, body `let x = 1`. */
export function frontmatterOnlyDoc(frontmatter: string): ThetaDocument {
  return parseDoc(`---\n${frontmatter}\n---\nlet x = 1\n`);
}

/** Assert a row is present at the given severity (default `error`) carrying the exact Message. */
export function expectDiagnosticRow(
  diags: readonly Diagnostic[],
  code: string,
  message: string,
  severity: Diagnostic["severity"] = "error",
): void {
  const row = findCode(diags, code);
  expect(
    row,
    `expected a ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeDefined();
  expect((row as Diagnostic).severity).toBe(severity);
  expect((row as Diagnostic).message).toBe(message);
}

/**
 * The single-line contract (diagnostic-shape.md:34): a `message` carries no
 * physical break. A raw U+000A forges the serialised content format's
 * blank-line block separator and `  hint:` continuation; a raw U+000D forges
 * the `\r\n`-terminated related-site line. Both are the operator-deception
 * vectors bug 0105 documented.
 */
export function assertSingleLine(message: string, label: string): void {
  expect(
    message.includes("\n"),
    `${label}: message must contain NO raw U+000A — a raw LF splits the single-line summary and forges the serialised content format's blank-line / hint-continuation shapes (diagnostic-shape.md:34, placeholder-rendering-b.md:75)`,
  ).toBe(false);
  expect(
    message.includes("\r"),
    `${label}: message must contain NO raw U+000D — the single-line summary admits no carriage return (diagnostic-shape.md:34)`,
  ).toBe(false);
}

/** Assert NO row carries the given code. */
export function expectNoDiagnosticRow(diags: readonly Diagnostic[], code: string): void {
  expect(
    findCode(diags, code),
    `expected NO ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeUndefined();
}

/** A parsed, cleanly-lowered `params:` block. */
export interface LoadedParams {
  readonly defs: Record<string, unknown>;
  readonly loweredSchema: LoweredSchema;
}

/**
 * Parse a fixture that must LOAD cleanly, and read its lowered `params:`
 * schema back. A non-empty diagnostic list, a `null` frontmatter, an absent
 * `params`, or an absent `loweredSchema` all throw, with the diagnostics
 * rendered, rather than let a caller read a field off an unloaded document.
 */
export function loadCleanly(label: string, source: string, path = "test.theta"): LoadedParams {
  const doc = parseDoc(source, path);
  expect(
    diagLines(doc),
    `${label}: this fixture must load with NO diagnostics; observed ${JSON.stringify(diagLines(doc))}`,
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
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return { defs: (lowered["$defs"] ?? {}) as Record<string, unknown>, loweredSchema: lowered };
}

/** Top-level statement kinds in source order. */
export function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}

/** Top-level declarations of this kind, preserving source order. */
export function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/**
 * Schema declarations from a prompt body that must load without diagnostics.
 * Read the statements, including alias-form declarations absent from `doc.schemas`,
 * and fail with the rendered diagnostics rather than mask a broken fixture.
 */
export function loadSchemaDecls(body: string, path: string): readonly SchemaDecl[] {
  const doc = parsePromptBody(body, path);
  if (doc.diagnostics.length > 0) {
    throw new Error(
      `harness: the decl body must load cleanly, but produced ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return schemaDeclsOf(doc);
}

/** One schema declaration's observable field capture. */
export interface CapturedSchema {
  readonly name: string;
  readonly fields: readonly { readonly name: string; readonly typeSource: string }[];
}

/** The schema declarations a document captured, in source order. */
export function capturedSchemas(doc: ThetaDocument): CapturedSchema[] {
  return schemaDeclsOf(doc).map((s) => ({
    name: s.name,
    fields: (s.fields ?? []).map((f) => ({ name: f.name, typeSource: f.typeSource })),
  }));
}

/** Top-level declarations of this kind, preserving source order. */
export function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}

/**
 * The lowered response schema for an annotation, or a loud failure.
 * `undefined` is reserved for the EMPTY annotation alone, so it is a harness
 * error here rather than a fixture outcome.
 */
export function loweredAnnotation(
  label: string,
  annotation: string,
  decls: readonly SchemaDecl[],
  enums: readonly EnumDecl[] = [],
  missingMessage = `${label}: \`@<${annotation}>\` lowered to nothing, so QRY-22 would bind an UNVALIDATED response; only the empty annotation may lower to undefined`,
): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, decls, enums);
  if (lowered === undefined) {
    throw new Error(missingMessage);
  }
  return lowered;
}

/**
 * Load `@<annotation>` through the SHIPPED path: `parseThetaDocument` for the
 * declarations and the diagnostics, then `lowerQueryResponseSchema` for the
 * annotation itself (the same pair the typed-query mechanism drives).
 * The caller supplies its fixture and diagnostic precondition before lowering.
 */
export function parseAndLowerAnnotation(
  label: string,
  annotation: string,
  fixture: {
    readonly source: string;
    readonly path: string;
    readonly assertDiagnostics: (doc: ThetaDocument) => void;
    readonly missingMessage: string;
  },
): LoweredSchema {
  const doc = parseDoc(fixture.source, fixture.path);
  fixture.assertDiagnostics(doc);
  return loweredAnnotation(label, annotation, schemaDeclsOf(doc), enumDeclsOf(doc), fixture.missingMessage);
}

/** Read a params field, failing loudly if its declaration was dropped. */
export function fieldOf(loaded: { readonly fields: readonly BypassParamsField[] }, wireName: string): BypassParamsField {
  const found = loaded.fields.find((f) => f.wireName === wireName);
  if (found === undefined) {
    throw new Error(
      `no params field '${wireName}' in ${JSON.stringify(loaded.fields)} — the declaration was dropped entirely`,
    );
  }
  return found;
}

/** Diagnostics for a code and file, in emission order. */
export function hitsFor(
  diagnostics: readonly Diagnostic[],
  code: string,
  file: string,
): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code && d.file === file);
}

/** A structural AST node carrying a kind discriminator. */
export interface KindedNode {
  readonly kind: string;
  readonly [key: string]: unknown;
}

/** Collect nodes of a kind, visiting each object identity once. */
export function collectByKind(root: unknown, kind: string): KindedNode[] {
  const out: KindedNode[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.kind === "string" && obj.kind === kind) {
      out.push(obj as KindedNode);
    }
    for (const key of Object.keys(obj)) {
      visit(obj[key]);
    }
  };
  visit(root);
  return out;
}

/** Locate the sole fixture anchor, retaining the cardinality preconditions and diagnostics. */
export function argRange(
  doc: ThetaDocument,
  callee: string,
  index: number,
  collectCalls: (doc: ThetaDocument) => readonly { readonly callee: string; readonly args: readonly SourceRange[] }[],
  render: (doc: ThetaDocument) => string,
): SourceRange {
  const calls = collectCalls(doc).filter((c) => c.callee === callee);
  expect(
    calls,
    `PRECONDITION: the fixture must hold exactly one call of '${callee}'; the parse found ${calls.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const args = calls[0]!.args;
  expect(
    args.length,
    `PRECONDITION: the call of '${callee}' must carry an argument at index ${index}; it carries ${args.length}. Diagnostics: ${render(doc)}`,
  ).toBeGreaterThan(index);
  return args[index]!;
}

/** Locate the sole fixture anchor, retaining the cardinality preconditions and diagnostics. */
export function letRange(
  doc: ThetaDocument,
  name: string,
  collectLets: (doc: ThetaDocument) => readonly { readonly name: string; readonly range: SourceRange }[],
  render: (doc: ThetaDocument) => string,
): SourceRange {
  const hits = collectLets(doc).filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.range;
}

/** The single diagnostic carrying `fragment`, or a loud failure naming the
 *  unmet precondition — never a silent skip when the expected diagnostic is
 *  absent or duplicated (the witness would otherwise be vacuous). */
export function soleByFragment(diagnostics: readonly Diagnostic[], fragment: string): Diagnostic {
  const hits = diagnostics.filter((d) => d.message.includes(fragment));
  expect(
    hits,
    `expected exactly one diagnostic whose message contains '${fragment}'; got ${hits.length}: ${JSON.stringify(hits.map((d) => d.message))}`,
  ).toHaveLength(1);
  return hits[0]!;
}

export interface SeamFixture {
  readonly deps: SystemNoteChannelDeps;
  /** Every batch the lexer delivered through the V7d `theta-system-note` seam. */
  readonly delivered: Diagnostic[][];
  /** Raw `sendMessage` envelopes, to pin batched single-send delivery. */
  readonly sent: Array<{ customType: string; details?: SystemNoteDetails }>;
}

/** Record lexer diagnostic batches and their raw system-note envelopes. */
export function seam(): SeamFixture {
  const delivered: Diagnostic[][] = [];
  const sent: Array<{ customType: string; details?: SystemNoteDetails }> = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      sent.push({
        customType: message.customType,
        ...(message.details !== undefined ? { details: message.details } : {}),
      });
      if ("diagnostics" in message.details!) {
        delivered.push([...message.details!.diagnostics]);
      }
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  return { deps, delivered, sent };
}

/** Lex a UTF-8 string source; return the lex result and the seam fixture. */
export function lexWithSeam(src: string): { result: LexResult; fixture: SeamFixture } {
  const fixture = seam();
  const result = lexTheta(
    { path: "test.theta", bytes: new TextEncoder().encode(src) },
    fixture.deps,
  );
  return { result, fixture };
}

/** Every diagnostic the lexer delivered through the V7d seam, flattened. */
export function deliveredDiagnostics(fixture: SeamFixture): Diagnostic[] {
  return fixture.delivered.flat();
}

/** Bind the params-default fixture scaffold to a declaration body and filename. */
export function paramsDefaultFixture(body: string, path: string): {
  readonly src: (paramsBlock: string) => string;
  readonly paramsDoc: (rhs: string) => ThetaDocument;
} {
  /** A `mode: prompt` theta whose `params:` block is `paramsBlock`. */
  function src(paramsBlock: string): string {
    return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${body}\n`;
  }

  /**
   * A `params:` right-hand side wrapped as a YAML single-quoted scalar.
   * Theta-side literals carry theta-side quotes, and an unquoted spelling of a
   * text carrying a `:`, a `#` or a `{` breaks the YAML frame outright, which
   * collapses the load to a different diagnostic entirely.
   */
  function paramsDoc(rhs: string): ThetaDocument {
    return parseDoc(src(`  p: '${rhs.replace(/'/g, "''")}'`), path);
  }

  return { src, paramsDoc };
}

/** The recorded default half of field `p`, or `undefined` when the load withheld it. */
export function recordedDefault(doc: ThetaDocument): string | undefined {
  return doc.frontmatter?.params?.fields.find((f) => f.wireName === "p")?.defaultSource;
}

/** The lowered `properties.p` fragment, or `undefined` when the load withheld it. */
export function loweredP(doc: ThetaDocument): unknown {
  const lowered = doc.frontmatter?.params?.loweredSchema as
    | { readonly properties?: Record<string, unknown> }
    | undefined;
  return lowered?.properties?.["p"];
}

/** Read the diagnostic after a caller has asserted its one-element count. */
export function firstDiagnostic(label: string, doc: ThetaDocument): Diagnostic {
  const diagnostic = doc.diagnostics[0];
  if (diagnostic === undefined) {
    throw new Error(`${label}: diagnostics[0] absent after a one-element count assertion`);
  }
  return diagnostic;
}

/** Assert the shared params-refusal disposition, retaining each caller's rationale and reader. */
export function expectParamsDropGateShape(
  label: string,
  doc: ThetaDocument,
  diagnostic: Diagnostic,
  readLowered: (doc: ThetaDocument) => unknown,
  clauses: { readonly severity: string; readonly frontmatter: string; readonly lowered: string },
): void {
  expect(diagnostic.severity, `${label}: ${clauses.severity}`).toBe("error");
  expect(doc.frontmatter, `${label}: ${clauses.frontmatter}`).toBeNull();
  expect(readLowered(doc), `${label}: ${clauses.lowered}`).toBeUndefined();
}

/**
 * Every LOOP-VARIABLE and `let` binder site of `doc` in source order, each
 * rendered `<kind> <name>@<range>`: a `for` / `par-for` site carries its
 * ITERAND's range (the span `checkForIterand` reports on), a `let` site carries
 * the statement's own range (the span the relation sinks report on).
 *
 * This is the loud precondition every row runs FIRST. These witnesses concern
 * a scope write that has no direct observable, so most rows assert an absence
 * or a single emission; without an anchor a fixture that stopped
 * parsing, lost its loop, or drifted a line would let those rows pass while
 * measuring nothing. A body the walk cannot reach throws naming the fixture
 * rather than returning an empty list.
 *
 * `includeCallArguments` also records `arg <callee>#<i>@<argument range>`
 * sites and visits statement-position tool calls and invokes. The let-arm
 * witness uses these anchors to prove its diagnostic sinks were reached.
 */
export function binderSites(
  doc: ThetaDocument,
  subject: string,
  { includeCallArguments = false }: { readonly includeCallArguments?: boolean } = {},
): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "par-for":
        out.push(`par-for ${e.variable}@${at(e.iterand.range)}`);
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      case "call":
        if (includeCallArguments) {
          e.args.forEach((a: Expr, i: number) => {
            out.push(`arg ${e.callee}#${i}@${at(a.range)}`);
          });
        }
        for (const a of e.args) walkExpr(a);
        return;
      case "invoke":
        for (const a of e.args) walkExpr(a);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "member":
        walkExpr(e.target);
        return;
      case "index":
        walkExpr(e.target);
        walkExpr(e.index);
        return;
      case "binary":
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      case "ternary":
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "result-ctor":
        walkExpr(e.arg);
        return;
      default:
        return;
    }
  };
  const walkBlock = (b: Block): void => {
    for (const s of b.statements) walkStmt(s);
    if (b.tail !== null) walkExpr(b.tail);
  };
  const walkStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        out.push(`let ${s.name}@${at(s.range)}`);
        if (s.init !== null) walkExpr(s.init);
        return;
      case "for":
        out.push(`for ${s.variable}@${at(s.iterand.range)}`);
        walkExpr(s.iterand);
        walkBlock(s.body);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      case "while":
        walkExpr(s.condition);
        walkBlock(s.body);
        return;
      case "if": {
        walkExpr(s.condition);
        walkBlock(s.then);
        // `otherwise` is a chained `IfStmt`, an `else` `Block`, or none; only
        // the statement form carries a `kind` discriminator.
        const otherwise = s.otherwise;
        if (otherwise !== null) {
          if ("kind" in otherwise) walkStmt(otherwise);
          else walkBlock(otherwise);
        }
        return;
      }
      // A bare `hs(ws)` in statement position is a `tool-call`, not an `expr`;
      // the let-arm's sinks live there as often as inside a `let`.
      case "tool-call":
        if (includeCallArguments) walkExpr(s.call);
        return;
      case "invoke":
        if (includeCallArguments) walkExpr(s.invoke);
        return;
      case "expr":
        walkExpr(s.expr);
        return;
      case "reassign":
        walkExpr(s.value);
        return;
      case "return":
        if (s.operand !== null) walkExpr(s.operand);
        return;
      default:
        return;
    }
  };
  const body = doc.body;
  if (body === null) {
    throw new Error(
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than ${subject}. Diagnostics: ${render(doc)}`,
    );
  }
  walkBlock(body);
  return out;
}

/** The whole aggregated diagnostic list as comparable `severity code message @range` strings. */
export function allHits(doc: ThetaDocument): string[] {
  return doc.diagnostics.map(
    (d: Diagnostic) => `${d.severity} ${d.code} ${d.message} @${at(d.range)}`,
  );
}

/** One expected entry of `allHits`, built from a registry-sourced message. */
export function hit(code: string, message: string, anchor: SourceRange): string {
  return `error ${code} ${message} @${at(anchor)}`;
}

export interface ArithmeticAnchors {
  readonly calls: ReadonlyArray<{ readonly callee: string; readonly args: readonly SourceRange[] }>;
  readonly lets: ReadonlyArray<{
    readonly name: string;
    readonly range: SourceRange;
    readonly init: SourceRange | undefined;
  }>;
  readonly objectFields: ReadonlyArray<{ readonly name: string; readonly value: SourceRange }>;
  readonly parForMaxes: readonly SourceRange[];
  /** Every division node — the division silence cells' non-vacuity channel. */
  readonly divisions: readonly SourceRange[];
  /** Every `{ kind: "binary", op: "%" }` node — the non-vacuity channel. */
  readonly modulos: readonly SourceRange[];
  /** The right operand of every `%` node, in the same order — group (D) reads it. */
  readonly moduloDivisors: readonly Expr[];
  /**
   * Every spelled `-`/`*`/`/`/`%` binary node's own range (bug 0332's gate
   * anchor), EXCLUDING the synthetic-`null`-left unary `-` shape — the same
   * exclusion `checkArithmeticOperands` itself applies.
   */
  readonly arithmeticOps: ReadonlyArray<{ readonly op: string; readonly range: SourceRange }>;
}

/**
 * Every anchor the division/modulo assertions range against, collected in one walk.
 *
 * The walk covers the node kinds these fixtures use; a fixture whose node it
 * cannot reach fails one of the loud preconditions below rather than letting an
 * absence assertion pass while measuring nothing. `modulos` is what makes the
 * silence cells non-vacuous: a cell asserting "`1 % -0` at this sink draws
 * nothing" first asserts the parsed fixture actually holds a `%` node.
 */
export function arithmeticAnchorsOf(doc: ThetaDocument): ArithmeticAnchors {
  const calls: Array<{ callee: string; args: SourceRange[] }> = [];
  const lets: Array<{ name: string; range: SourceRange; init: SourceRange | undefined }> = [];
  const objectFields: Array<{ name: string; value: SourceRange }> = [];
  const parForMaxes: SourceRange[] = [];
  const divisions: SourceRange[] = [];
  const modulos: SourceRange[] = [];
  const moduloDivisors: Expr[] = [];
  const arithmeticOps: Array<{ op: string; range: SourceRange }> = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        calls.push({ callee: e.callee, args: e.args.map((a) => a.range) });
        for (const a of e.args) walkExpr(a);
        return;
      case "invoke":
        calls.push({ callee: "invoke", args: e.args.map((a) => a.range) });
        for (const a of e.args) walkExpr(a);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) {
          objectFields.push({ name: f.name, value: f.value.range });
          walkExpr(f.value);
        }
        return;
      case "ternary":
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "binary":
        if (e.op === "/") divisions.push(e.range);
        if (e.op === "%") {
          modulos.push(e.range);
          moduloDivisors.push(e.right);
        }
        if (["-", "*", "/", "%"].includes(e.op) && !(e.op === "-" && e.left.kind === "null")) {
          arithmeticOps.push({ op: e.op, range: e.range });
        }
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      case "member":
        walkExpr(e.target);
        return;
      case "index":
        walkExpr(e.target);
        walkExpr(e.index);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      case "result-ctor":
        walkExpr(e.arg);
        return;
      case "par-for":
        walkExpr(e.iterand);
        if (e.max !== null) {
          parForMaxes.push(e.max.range);
          walkExpr(e.max);
        }
        walkBlock(e.body);
        return;
      default:
        return;
    }
  };
  const walkBlock = (b: Block): void => {
    for (const s of b.statements) walkStmt(s);
    if (b.tail !== null) walkExpr(b.tail);
  };
  const walkStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        lets.push({ name: s.name, range: s.range, init: s.init?.range });
        if (s.init !== null) walkExpr(s.init);
        return;
      case "reassign":
        walkExpr(s.value);
        return;
      case "expr":
        walkExpr(s.expr);
        return;
      case "tool-call":
        walkExpr(s.call);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
      case "return":
        if (s.operand !== null) walkExpr(s.operand);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      case "for":
        walkExpr(s.iterand);
        walkBlock(s.body);
        return;
      case "while":
        walkExpr(s.condition);
        walkBlock(s.body);
        return;
      case "if":
        walkExpr(s.condition);
        walkBlock(s.then);
        return;
      default:
        return;
    }
  };
  walkBlock(doc.body);
  return { calls, lets, objectFields, parForMaxes, divisions, modulos, moduloDivisors, arithmeticOps };
}

/**
 * The range of the fixture's sole spelled `op` arithmetic node — bug 0332's
 * `theta/parse/non-numeric-arithmetic-operands` anchor, which is the BINARY
 * node's own range, not its enclosing statement/literal (L4's third hit is
 * narrower than the array literal ARRAY_ELEMENT_CODE anchors on).
 */
export function arithmeticOpRange(doc: ThetaDocument, op: string): SourceRange {
  const hits = arithmeticAnchorsOf(doc).arithmeticOps.filter((a) => a.op === op);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one spelled '${op}' arithmetic node; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.range;
}

/** Locate the arithmetic fixture anchor using the shared cardinality checks. */
export function arithmeticArgRange(doc: ThetaDocument, callee: string, index: number): SourceRange {
  return argRange(doc, callee, index, (doc) => arithmeticAnchorsOf(doc).calls, render);
}

/** Locate the arithmetic fixture anchor using the shared cardinality checks. */
export function arithmeticLetRange(doc: ThetaDocument, name: string): SourceRange {
  return letRange(doc, name, (doc) => arithmeticAnchorsOf(doc).lets, render);
}

/** The range of that `let`'s initialiser — the array-element sink's anchor. */
export function letInitRange(doc: ThetaDocument, name: string): SourceRange {
  const hits = arithmeticAnchorsOf(doc).lets.filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const init = hits[0]!.init;
  expect(
    init,
    `PRECONDITION: \`let ${name}\` must carry an initialiser. Diagnostics: ${render(doc)}`,
  ).toBeDefined();
  return init as SourceRange;
}

/** The range of the sole schema-constructor field value named `field`. */
export function objectFieldRange(doc: ThetaDocument, field: string): SourceRange {
  const hits = arithmeticAnchorsOf(doc).objectFields.filter((f) => f.name === field);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one constructor field '${field}'; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.value;
}

/** The range of the sole `par for … max` operand — that sink's own anchor. */
export function parForMaxRange(doc: ThetaDocument): SourceRange {
  const hits = arithmeticAnchorsOf(doc).parForMaxes;
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`par for … max\` operand; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!;
}

interface RawRead {
  readonly display: string;
  readonly vsInteger: Compatibility;
  readonly raw: string;
}

/** An empty `TypeEnv`: the raw-read fixtures declare no named type. */
const EMPTY_TYPE_ENV = {} as TypeEnv;

/**
 * `StaticTypeInferencePass.typeOf` on the fixture's body tail.
 *
 * The read is reported as `displayType` plus `checkCompatible(t, integer)`
 * rather than as the raw `CompatType` object: those two are what every sink in
 * the arithmetic fixture suites consumes, and the `literal`-versus-`prim` distinction
 * the object carries is not the observable under test. The raw object rides along
 * in the failure payload so a red names the shape that produced it.
 */
function typeOfTail(doc: ThetaDocument, cell: string): RawRead {
  expect(
    doc.diagnostics.filter((d: Diagnostic) => d.severity === "error").map((d) => d.code),
    `PRECONDITION (${cell}): the raw-read fixture must parse without an error-severity diagnostic, or the type read below is about a parse failure. Diagnostics: ${render(doc)}`,
  ).toEqual([]);
  const tail = doc.body.tail;
  expect(
    tail,
    `PRECONDITION (${cell}): the fixture must end in a trailing expression, which is the node the read is taken on. Diagnostics: ${render(doc)}`,
  ).not.toBeNull();
  const type = new StaticTypeInferencePass({ checkCompatible, enumNames: new Set() }).typeOf(
    tail as Expr,
    EMPTY_TYPE_ENV,
  );
  return {
    display: displayType(type),
    vsInteger: checkCompatible(type, { kind: "prim", name: "integer" }, EMPTY_TYPE_ENV),
    raw: JSON.stringify(type),
  };
}

/** `display|vs-integer` — one comparable string per raw read. */
export function numericReading(doc: ThetaDocument, cell: string): string {
  const r = typeOfTail(doc, cell);
  return `${r.display}|${r.vsInteger}`;
}

/** `fn g(n: integer)` — the annotated sink group (a) and half of group (c) drive. */
export const G_INT = "fn g(n: integer): number { 1 }\n";

/** The spec-correct parameter annotation for a `/` result. */
export const G_NUM = "fn g(n: number): number { 1 }\n";

/** A sink that fires on an `integer` and on a `number` alike (cell aRender). */
export const G_STR = "fn g(s: string): number { 1 }\n";

/** The `integer`-declared schema field of cells c1 / c2 / h4. */
export const S_INT = "schema S { n: integer }\n";

/** The `string`-declared schema field of cells L3 / L3c (finding F3). */
export const S_STR = "schema S { s: string }\n";

/** Every diagnostic rendered `severity code: message @l:c-l:c`, in emission order. */
export function rendered(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code}: ${d.message} @${at}`;
  });
}

/**
 * One expected diagnostic in `rendered`'s form. Expected spans are single-line,
 * so the row reads `line, startColumn, endColumn` with the end
 * column exclusive.
 */
export function diag(
  severity: "error" | "warning",
  code: string,
  message: string,
  line: number,
  startColumn: number,
  endColumn: number,
): string {
  return `${severity} ${code}: ${message} @${line}:${startColumn}-${line}:${endColumn}`;
}

/** A resolved Pi-tool stand-in (the ToolDefinition is opaque to this seam). */
function piTool(name: string): ResolvedPiTool {
  return { kind: "pi-tool", toolDefinition: { name } };
}

/**
 * Build `CallableSetDeps` from an explicit Pi-tool registry, a `.theta`
 * resolution table (keyed by the path literal as written), and reserved
 * top-level names. Anything absent resolves as unknown / unresolvable.
 */
export function callableSetDeps(opts?: {
  piTools?: readonly string[];
  thetaCallees?: Readonly<Record<string, Omit<ResolvedThetaCallee, "calleePath">>>;
  reservedNames?: readonly string[];
}): CallableSetDeps {
  const piTools = new Set(opts?.piTools ?? []);
  const thetaCallees = opts?.thetaCallees ?? {};
  return {
    resolvePiTool: (name) => (piTools.has(name) ? piTool(name) : undefined),
    resolveThetaCallee: (thetaPath) => {
      const callee = thetaCallees[thetaPath];
      return callee === undefined ? undefined : { ...callee, calleePath: thetaPath };
    },
    reservedNames: new Set(opts?.reservedNames ?? []),
  };
}

/** Resolve a comma-separated short-form `tools:` value. */
export function resolveScalar(text: string, d: CallableSetDeps): CallableSetResult {
  const tools: ToolsField = { kind: "scalar", text };
  return resolveCallableSet({ file: "test.theta", tools, deps: d });
}

/**
 * A resolved `.theta` callee stand-in with a given declared mode. The
 * `calleePath` is injected by the `callableSetDeps` factory from the resolution-table key
 * (mirroring production: `resolveEntry` overwrites it from the entry `spec`).
 */
export function thetaCallee(mode: "prompt" | "subagent"): Omit<ResolvedThetaCallee, "calleePath"> {
  return { kind: "theta", mode };
}

/** Resolve a YAML list-form `tools:` value. */
export function resolveList(items: readonly string[], d: CallableSetDeps): CallableSetResult {
  const tools: ToolsField = { kind: "list", items };
  return resolveCallableSet({ file: "test.theta", tools, deps: d });
}
