// Shared drivers for the S1 (language-core) e2e coverage tests.
//
// These wrap the REAL production front-end entry points — `lexTheta`
// (src/lexer/lexer.ts) and `parseThetaDocument` (src/parser/theta-document.ts) —
// with inert, in-band recording seams so a test can assert on the returned
// diagnostics / tokens without a model or session. The frontmatter-only
// helpers share the same resolving matcher and diagnostic finder. No behaviour is stubbed:
// the code paths under assertion are the shipped ones.
import { type SourceRange } from "../../src/diagnostics/diagnostic";
import { type BypassParamsField } from "../../src/binder/binder-envelope";
import { expect } from "vitest";
import { lexTheta, type LexResult, type ThetaSource } from "../../src/lexer/lexer";
import {
  parseThetaDocument,
  type FnDecl,
  type LetStmt,
  type ThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type EnumDecl,
} from "../../src/parser/theta-document";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type {
  SystemNoteChannelDeps,
  SystemNoteSender,
} from "../../src/extension/system-note-channel";
import {
  parseFrontmatter,
  type FrontmatterParseResult,
  type ModelReferenceMatcher,
} from "../../src/parser/frontmatter";
import type { LoweredSchema } from "../../src/seams/schema-validator";

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

/** Parse a UTF-8 `.theta` source string through the whole-document pipeline. */
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
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

/** All distinct diagnostic codes present (sorted, for readable failures). */
export function codes(diags: readonly Diagnostic[]): string[] {
  return [...new Set(diags.map((d) => d.code))].sort();
}

/** Error-severity diagnostics only. */
export function errors(diags: readonly Diagnostic[]): Diagnostic[] {
  return diags.filter((d) => d.severity === "error");
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

/** Every diagnostic rendered `<severity> <code>`, in emission order. */
export function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
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

/** Top-level declarations of this kind, preserving source order. */
export function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
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
