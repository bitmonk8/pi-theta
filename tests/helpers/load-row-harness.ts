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
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. Nothing here is stubbed: `loadRow` parses
// through the real `parseDoc` (`tests/helpers/e2e-s1.ts`), itself a thin,
// inert-deps wrapper over the shipped `parseThetaDocument`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../../src/parser/theta-document";
import { parseDoc } from "./e2e-s1";

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
  readFileSync(
    fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url)),
    "utf8",
  ),
) as ParseCodeRegistryRow[];

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a row whose *Message* moved reds by naming the registry page rather than by a
 * bare `undefined` comparison downstream.
 */
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
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

/** One rendered diagnostic line, `<severity> <code>: <message>` — the bug documents' own rendering. */
export function registryLineOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  return `error ${code}: ${registryMessageOf(registry, registryPath, code, fills)}`;
}

// ===========================================================================
// The load harness.
// ===========================================================================

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
